import bcrypt from "bcryptjs";
import { DataTypes, Sequelize } from "sequelize";
import { afterEach, describe, expect, it, vi } from "vitest";
import useBcrypt, { BcryptError } from "../src/index.js";

const rounds = 4;

async function createDatabase() {
  const sequelize = new Sequelize("sqlite::memory:", { logging: false });
  const User = sequelize.define("User", {
    email: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING },
    recoveryPassword: { type: DataTypes.STRING },
  });

  await sequelize.sync();
  return { sequelize, User };
}

describe("useBcrypt", () => {
  const databases: Sequelize[] = [];

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.close()));
  });

  it("hashes a new password once and compares it", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    const user = await database.User.create({
      email: "user@example.com",
      password: "correct horse",
    });
    const password = user.get("password");

    expect(password).toMatch(/^\$2[aby]\$04\$/);
    expect(password).not.toBe("correct horse");
    expect(
      (
        user as typeof user & { authenticate: (value: string) => boolean }
      ).authenticate("correct horse"),
    ).toBe(true);
    expect(
      (
        user as typeof user & { authenticate: (value: string) => boolean }
      ).authenticate("wrong password"),
    ).toBe(false);
  });

  it("hashes only changed values and compares the current hash after an update", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    const user = await database.User.create({
      email: "user@example.com",
      password: "first password",
    });
    const firstHash = user.get("password");

    await user.save();
    expect(user.get("password")).toBe(firstHash);

    user.set("password", "second password");
    await user.save();

    const typedUser = user as typeof user & {
      authenticate: (value: string) => boolean;
    };
    expect(user.get("password")).not.toBe(firstHash);
    expect(typedUser.authenticate("second password")).toBe(true);
    expect(typedUser.authenticate("first password")).toBe(false);
  });

  it("supports multiple fields and remains idempotent", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });
    useBcrypt(database.User, { rounds, compare: "verifyPassword" });
    useBcrypt(database.User, { rounds });
    useBcrypt(database.User, {
      field: "recoveryPassword",
      compare: "authenticateRecoveryPassword",
      rounds,
    });

    const user = await database.User.create({
      email: "user@example.com",
      password: "main password",
      recoveryPassword: "recovery password",
    });
    const typedUser = user as typeof user & {
      authenticate: (value: string) => boolean;
      verifyPassword: (value: string) => boolean;
      authenticateRecoveryPassword: (value: string) => boolean;
    };

    expect(typedUser.authenticate("main password")).toBe(true);
    expect(typedUser.verifyPassword("main password")).toBe(true);
    expect(typedUser.authenticateRecoveryPassword("recovery password")).toBe(
      true,
    );
  });

  it("leaves nullable values untouched", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    const user = await database.User.create({ email: "user@example.com" });

    expect(user.get("password")).toBeUndefined();
  });

  it("rejects invalid configuration", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);

    expect(() => useBcrypt(database.User, { rounds: 3 })).toThrow(RangeError);
    expect(() => useBcrypt(database.User, { field: "   " })).toThrow(TypeError);
    expect(() => useBcrypt(database.User, { compare: "" })).toThrow(TypeError);
    expect(() => useBcrypt(database.User, { field: "missing" })).toThrow(
      /not defined/,
    );
    expect(() => useBcrypt(undefined as never)).toThrow(TypeError);
  });

  it("rejects conflicting rounds for a registered field", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    expect(() => useBcrypt(database.User, { rounds: rounds + 1 })).toThrow(
      /already registered/,
    );
  });

  it("rejects comparison method collisions", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    Object.defineProperty(database.User.prototype, "authenticate", {
      value: () => true,
    });

    expect(() => useBcrypt(database.User, { rounds })).toThrow(
      /already defined/,
    );
  });

  it("rejects non-string values", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    const user = await database.User.create({
      email: "user@example.com",
      password: "valid password",
    });
    user.set("password", 123);

    await expect(user.save()).rejects.toThrow(/must contain a string/);
  });

  it("returns false for invalid comparison input", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });

    const user = await database.User.create({ email: "user@example.com" });
    const typedUser = user as typeof user & {
      authenticate: (value: string) => boolean;
    };

    expect(typedUser.authenticate("password")).toBe(false);
    expect(
      (typedUser.authenticate as (value: unknown) => boolean).call(
        typedUser,
        null,
      ),
    ).toBe(false);
  });

  it("wraps hashing errors with the field context", async () => {
    const database = await createDatabase();
    databases.push(database.sequelize);
    useBcrypt(database.User, { rounds });
    vi.spyOn(bcrypt, "hash").mockRejectedValueOnce(new Error("hash failed"));

    const user = database.User.build({
      email: "user@example.com",
      password: "password",
    });

    try {
      await user.save();
      throw new Error("Expected hashing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BcryptError);
      expect(error).toMatchObject({ message: "Failed to hash password" });
      expect((error as BcryptError).cause).toBeInstanceOf(Error);
    }
    vi.restoreAllMocks();
  });
});
