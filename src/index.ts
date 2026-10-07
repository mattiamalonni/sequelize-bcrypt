import bcrypt from 'bcryptjs';
import { type Model, type ModelStatic } from 'sequelize';

export interface BcryptOptions {
  field?: string;
  rounds?: number;
  compare?: string;
}

export type BcryptCompareMethod = (plainValue: string) => boolean;

export type BcryptModelStatic<T extends Model = Model> = ModelStatic<T> & {
  prototype: T & Record<string, BcryptCompareMethod>;
};

export class BcryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BcryptError';
  }
}

const DEFAULT_OPTIONS: Required<BcryptOptions> = {
  field: 'password',
  rounds: 12,
  compare: 'authenticate',
};

type Registration = {
  rounds: number;
  compareMethods: Set<string>;
};

const registrations = new WeakMap<ModelStatic<Model>, Map<string, Registration>>();

function validateOptions(options: Required<BcryptOptions>): void {
  if (!options.field.trim()) {
    throw new TypeError('The bcrypt field name must not be empty');
  }

  if (!options.compare.trim()) {
    throw new TypeError('The bcrypt comparison method name must not be empty');
  }

  if (!Number.isInteger(options.rounds) || options.rounds < 4 || options.rounds > 31) {
    throw new RangeError('The bcrypt rounds option must be an integer between 4 and 31');
  }
}

function getRegisteredFields(model: ModelStatic<Model>): Map<string, Registration> {
  const existing = registrations.get(model);
  if (existing) {
    return existing;
  }

  const created = new Map<string, Registration>();
  registrations.set(model, created);
  return created;
}

/**
 * Adds bcrypt hashing functionality to a Sequelize model
 * @param Model - The Sequelize model to enhance
 * @param options - Configuration options for bcrypt behavior
 */
const useBcrypt = (Model: ModelStatic<Model>, options: BcryptOptions = {}): void => {
  if (!Model) {
    throw new TypeError('The required Sequelize model option is missing');
  }

  const config = { ...DEFAULT_OPTIONS, ...options };
  validateOptions(config);

  if (!Object.prototype.hasOwnProperty.call(Model.rawAttributes, config.field)) {
    throw new TypeError(`The bcrypt field "${config.field}" is not defined on the model`);
  }

  const modelRegistrations = getRegisteredFields(Model);
  const existingRegistration = modelRegistrations.get(config.field);

  if (existingRegistration) {
    if (existingRegistration.rounds !== config.rounds) {
      throw new Error(
        `The bcrypt field "${config.field}" is already registered with ${existingRegistration.rounds} rounds`,
      );
    }

    if (!existingRegistration.compareMethods.has(config.compare)) {
      addComparisonMethod(Model, config.field, config.compare);
      existingRegistration.compareMethods.add(config.compare);
    }

    return;
  }

  const hashPasswordField = async (instance: Model): Promise<void> => {
    if (!instance.changed(config.field as keyof Model)) {
      return;
    }

    const fieldValue = instance.get(config.field);
    if (fieldValue === null || fieldValue === undefined) {
      return;
    }

    if (typeof fieldValue !== 'string') {
      throw new TypeError(`The bcrypt field "${config.field}" must contain a string`);
    }

    try {
      const hashedValue = await bcrypt.hash(fieldValue, config.rounds);
      instance.set(config.field, hashedValue);
    } catch (error) {
      throw new BcryptError(`Failed to hash ${config.field}`, { cause: error });
    }
  };

  addComparisonMethod(Model, config.field, config.compare);
  Model.addHook('beforeSave', `sequelizeBcrypt:${config.field}`, hashPasswordField);
  modelRegistrations.set(config.field, {
    rounds: config.rounds,
    compareMethods: new Set([config.compare]),
  });
};

function addComparisonMethod(model: ModelStatic<Model>, field: string, compare: string): void {
  if (Object.prototype.hasOwnProperty.call(model.prototype, compare)) {
    throw new Error(`The comparison method "${compare}" is already defined on the model`);
  }

  const compareMethod: BcryptCompareMethod = function (this: Model, plainValue: string): boolean {
    const hashedValue = this.get(field);

    if (typeof hashedValue !== 'string' || typeof plainValue !== 'string') {
      return false;
    }

    return bcrypt.compareSync(plainValue, hashedValue);
  };

  Object.defineProperty(model.prototype, compare, {
    value: compareMethod,
    writable: false,
    enumerable: false,
    configurable: true,
  });
}

// Export only the main function and configuration interface
export { useBcrypt };
export default useBcrypt;
