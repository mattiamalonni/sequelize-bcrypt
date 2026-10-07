# sequelize-bcrypt

Automatic bcrypt hashing and password comparison for Sequelize 6 models.

## Requirements

- Node.js 24 or newer
- Sequelize 6
- `bcryptjs` 3

## Installation

```bash
npm install sequelize-bcrypt bcryptjs sequelize
```

`sequelize` is a peer dependency because the application must use the same Sequelize instance and version as the model. `bcryptjs` is installed as a runtime dependency.

## Usage

```ts
import { DataTypes, Sequelize } from "sequelize";
import useBcrypt from "sequelize-bcrypt";

const sequelize = new Sequelize("sqlite::memory:");
const User = sequelize.define("User", {
  email: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
});

useBcrypt(User);

const user = await User.create({
  email: "user@example.com",
  password: "correct horse battery staple",
});

user.authenticate("correct horse battery staple"); // true
user.authenticate("wrong password"); // false
```

### CommonJS

```js
const { DataTypes, Sequelize } = require("sequelize");
const { useBcrypt } = require("sequelize-bcrypt");

const sequelize = new Sequelize("sqlite::memory:");
const User = sequelize.define("User", {
  password: { type: DataTypes.STRING, allowNull: false },
});

useBcrypt(User);
```

## Configuration

```ts
useBcrypt(User, {
  field: "password",
  rounds: 12,
  compare: "authenticate",
});
```

- `field`: model attribute to hash. Defaults to `password`.
- `rounds`: bcrypt cost factor from 4 to 31. Defaults to `12`.
- `compare`: instance method name. Defaults to `authenticate`.

Multiple fields are supported. Calling `useBcrypt` repeatedly for the same model and field is idempotent; registering the same field with a different cost factor throws an error.

```ts
useBcrypt(User, {
  field: "recoveryPassword",
  compare: "authenticateRecoveryPassword",
  rounds: 12,
});
```

## How It Works

`useBcrypt` validates the configured field and adds a Sequelize `beforeSave` hook. The hook:

1. Runs for both new records and updates.
2. Hashes only when the configured field has changed.
3. Leaves `null` and `undefined` values untouched.
4. Rejects non-string values before persistence.
5. Stores the hash only after bcrypt completes successfully.

The comparison method reads the current field value and calls `bcrypt.compareSync`. It returns `false` when the record has no valid hash or the plain value is not a string.

The plugin does not validate password strength, enforce a required field, or choose a password policy. Use Sequelize validators or application-level validation for those concerns.

## Error Handling

Invalid configuration throws synchronously:

- `TypeError` for a missing model, empty names, or an undefined model field.
- `RangeError` when `rounds` is not an integer between 4 and 31.
- `Error` when a comparison method already exists or a field is registered with a different cost factor.

Hashing failures are reported as `BcryptError`. The original bcrypt error is available through its `cause` property.

```ts
import useBcrypt, { BcryptError } from "sequelize-bcrypt";

try {
  useBcrypt(User, { rounds: 12 });
  await User.create({ password: "secret" });
} catch (error) {
  if (error instanceof BcryptError) {
    console.error("Password hashing failed", error.cause);
  }
}
```

## API

```ts
interface BcryptOptions {
  field?: string;
  rounds?: number;
  compare?: string;
}

type BcryptCompareMethod = (plainValue: string) => boolean;

type BcryptModelStatic<T extends Model = Model> = ModelStatic<T> & {
  prototype: T & Record<string, BcryptCompareMethod>;
};

class BcryptError extends Error {}

function useBcrypt(model: ModelStatic<Model>, options?: BcryptOptions): void;
```

## Migration Notes

Existing users can keep calling `useBcrypt(Model, options)` with the same options. The current implementation registers one idempotent `beforeSave` hook instead of separate create/save hooks, preventing double hashing during creation. It also compares against the current hash after a password update.

When upgrading, check that:

- the configured field exists on the model;
- the comparison method name is not already defined;
- password fields contain strings before saving;
- tests do not rely on comparing against a previous password hash.

## Development

```bash
npm install
npm run check
npm run test:coverage
npm run build
```

The package publishes ESM, CommonJS, source maps, and TypeScript declarations from `dist/`. `prepublishOnly` runs checks, coverage, and build.

## License

MIT © [Mattia Malonni](https://github.com/mattiamalonni)

Automatic bcrypt hashing and password comparison for Sequelize 6 models.

## Requirements

- Node.js 24 or newer
- Sequelize 6
- `bcryptjs` 3

## Installation

```bash
npm install sequelize-bcrypt bcryptjs sequelize
```

## Usage

```ts
import { DataTypes, Sequelize } from "sequelize";
import useBcrypt from "sequelize-bcrypt";

const sequelize = new Sequelize("sqlite::memory:");
const User = sequelize.define("User", {
  email: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
});

useBcrypt(User);

const user = await User.create({
  email: "user@example.com",
  password: "correct horse battery staple",
});

user.authenticate("correct horse battery staple"); // true
user.authenticate("wrong password"); // false
```

`useBcrypt` registers one `beforeSave` hook. A password is hashed only when its field changes, so creation and updates are both covered without double hashing. Comparisons always use the current field value.

## Configuration

```ts
useBcrypt(User, {
  field: "password",
  rounds: 12,
  compare: "authenticate",
});
```

- `field`: model attribute to hash. Defaults to `password`.
- `rounds`: bcrypt cost factor from 4 to 31. Defaults to `12`.
- `compare`: instance method name. Defaults to `authenticate`.

Multiple fields are supported. Calling `useBcrypt` repeatedly for the same model and field is idempotent; registering the same field with a different cost factor throws an error.

```ts
useBcrypt(User, {
  field: "recoveryPassword",
  compare: "authenticateRecoveryPassword",
  rounds: 12,
});
```

Nullish values are left untouched. Non-string values fail before persistence. Password strength and required-field validation should be enforced by the application or another Sequelize validation layer.

## API

```ts
interface BcryptOptions {
  field?: string;
  rounds?: number;
  compare?: string;
}

type BcryptCompareMethod = (plainValue: string) => boolean;

type BcryptModelStatic<T extends Model = Model> = ModelStatic<T> & {
  prototype: T & Record<string, BcryptCompareMethod>;
};

class BcryptError extends Error {}

function useBcrypt(model: ModelStatic<Model>, options?: BcryptOptions): void;
```

Hash failures are reported as `BcryptError` with the original error available as `cause`.

## Development

```bash
npm install
npm run check
npm run test:coverage
npm run build
```

The package publishes ESM, CommonJS, source maps, and TypeScript declarations from `dist/`. `prepublishOnly` runs checks, coverage, and build.

## License

MIT © [Mattia Malonni](https://github.com/mattiamalonni)
