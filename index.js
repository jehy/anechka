'use strict';

const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');

const {updateTimeTables, updateUsers, initSpreadSheets} = require('./modules/spreadsheets');
const {updateSlackUsers, updateSlack, initSlack} = require('./modules/slack');

initSpreadSheets();
initSlack();

const log = bunyan.createLogger({name: 'anechka:global'});

const updateInterval = 1000 * 60 * (config.updateInterval || 5);// from config or every 5 minutes
// const updateInterval = 1000 * 20;// every 60 second
async function run() {
  try {
    await Promise.all([updateTimeTables(), updateUsers(), updateSlackUsers()]);
    return updateSlack();
  } catch (err)
  {
    log.error(`ERR: ${err}`);
    return false;
  }
}

async function start() {
  await run();
  setInterval(() => run(), updateInterval);
}

start();
