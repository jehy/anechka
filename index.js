'use strict';

const config = require('config');
const Debug = require('debug');
const Promise = require('bluebird');

const {updateTimeTables, updateUsers} = require('./modules/spreadsheets');
const {updateSlackUsers, updateSlack} = require('./modules/slack');

const gobalDebug = Debug('anechka');

const updateInterval = 1000 * 60 * (config.updateInterval || 5);// from config or every 5 minutes
// const updateInterval = 1000 * 20;// every 60 second
async function run() {
  return Promise.all([updateTimeTables(), updateUsers(), updateSlackUsers()])
    .then(() => {
      return updateSlack();
    })
    .catch((err) => {
      gobalDebug(`ERR: ${err}`);
    });
}

async function start() {
  await run();
  setInterval(() => run(), updateInterval);
}

start();
