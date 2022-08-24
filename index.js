const { ValidationError } = require('sequelize');
const bcrypt = require('bcryptjs');

const DEFAULT_OPTIONS = {
  field: 'password',
  rounds: 12,
  compare: 'authenticate',
};

const useBcrypt = (Model, options = DEFAULT_OPTIONS) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const hashField = function (instance) {
    try {
      const changedKey = Array.from(instance._changed).find(key => key === opts.field);
      if (!changedKey) return;

      const fieldDefinition = instance.rawAttributes[changedKey];
      if (!fieldDefinition) return;

      const plainValue = instance[changedKey];
      if (!plainValue) return;

      const salt = bcrypt.genSaltSync(opts.rounds);
      const hashedValue = bcrypt.hashSync(plainValue, salt);
      instance[changedKey] = hashedValue;
    } catch (err) {
      throw new ValidationError(err.message);
    }
  };

  Model.prototype[opts.compare] = function (plainValue) {
    return bcrypt.compareSync(plainValue, this._previousDataValues[opts.field]);
  };

  Model.addHook('beforeSave', hashField);
};

exports.bcrypt = bcrypt;
exports.useBcrypt = useBcrypt;
module.exports = useBcrypt;
