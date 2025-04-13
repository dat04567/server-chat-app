const { profile } = require('console');
const dynamoose = require('../config/database');
const crypto = require('crypto');

const userSchema = new dynamoose.Schema({
   id: {
      type: String,
      hashKey: true,
      default: () => crypto.randomUUID()
   },
   username: {
      type: String,
      required: true,
      index: {
         name: 'usernameIndex',
         global: true
      }
   },
   password: {
      type: String,
      required: true,
   },
   email: {
      type: String,
      required: true,
      index: {
         name: 'emailIndex',
         global: true
      }
   },
   role: {
      type: String,
      enum: ['user', 'admin', 'bot'],
      default: 'user'
   },
   bio: {
      type: String,
      default: ''
   },
   isVerified: {
      type: Boolean,
      default: false
   },
   verificationToken: {
      type: String
   },
   verificationExpires: {
      type: Number
   },
   lastActive: {
      type: String,
      default: new Date().toISOString()
   },
   profile: {
      type: Object,
      schema: {
         firstName: {
            type: String,
            required: true
         },
         lastName: {
            type: String,
            required: true
         },
         phone: {
            type: String,
            default: ''
         },
      }
   },
   createAt: {
      type: String,
      default: new Date().toISOString()
   },
   lastSeen: {
      type: String,
      default: new Date().toISOString()
   },
   status: {
      type: String,
      enum: ['ONLINE', 'OFFLINE'],
      default: 'OFFLINE'
   },
   updateAt: {
      type: String,
      default: new Date().toISOString()
   }
});





// Khai báo User model từ schema
const User = dynamoose.model('User', userSchema);

module.exports = User;