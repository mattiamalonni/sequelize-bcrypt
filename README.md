# sequelize-bcrypt

## Installation

```bash
npm i sequelize-bcrypt
```

## Setup

```javascript
const { Sequelize, DataTypes } = require('sequelize');
const useBcrypt = require('sequelize-bcrypt');

const database = new Sequelize({
  ...sequelizeConnectionOptions,
});

const User = database.define('User', {
  email: { type: DataTypes.STRING },
  password: { type: DataTypes.STRING },
});

useBcrypt(User, options);
```

## Options

```javascript
{
  field: 'password', // secret field to hash, default: 'password'
  rounds: 12, // used to generate bcrypt salt, default: 12
  compare: 'authenticate', // method used to compare secrets, default: 'authenticate'
}
```

## Usage

```javascript
User.create({ email: 'john.doe@example.com', password: 'SuperSecret!' });
// { id: 1, email: 'john.doe@example.com', password: '$2a$12$VtyL7j5xx6t/GmmAqy53ZuKJ1nwPox5kHLXDaottN9tIQBsEB3EsW' }

const user = await User.findOne({ where: { email: 'john.doe@example.com' } });
user.authenticate('WrongPassword!'); // false
user.authenticate('SuperSecret!'); // true
```
