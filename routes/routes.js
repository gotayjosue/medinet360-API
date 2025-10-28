const express = require('express');
const router = new express.Router();
const controllers = require('../controllers/mainController');

router.get('/', controllers.homeView)

module.exports =  router