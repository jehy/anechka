'use strict';

const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');

const {updateTimeTables, updateUsers} = require('./modules/spreadsheets');
const {updateSlackUsers, updateSlack} = require('./modules/slack');

const log = bunyan.createLogger({name: 'anechka:global'});

const updateInterval = 1000 * 60 * (config.updateInterval || 5);// from config or every 5 minutes
// const updateInterval = 1000 * 20;// every 60 second
async function run() {
  return Promise.all([updateTimeTables(), updateUsers(), updateSlackUsers()])
    .then(() => {
      return updateSlack();
    })
    .catch((err) => {
      log.error(`ERR: ${err}`);
    });
}

async function start() {
  await run();
  setInterval(() => run(), updateInterval);
}

start();
