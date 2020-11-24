'use strict';

const {google} = require('googleapis');
const moment = require('moment');
const config = require('config');
const Promise = require('bluebird');
const fs = require('fs-extra');
const bunyan = require('bunyan');
const path = require('path');

let log;
// Load client secrets from a local file.

const {
  transpose,
  timeTableHash,
  userTimeTableHash,
} = require('./utils');

const caches = require('./caches');

let getSpreadSheet;
let init;

/* istanbul ignore next */
function initSpreadSheets() {
  if (init) {
    return;
  }
  log = bunyan.createLogger({name: 'anechka:spreadsheets'});
  let oAuth2Client;
  try {
    const credentials = fs.readJsonSync(path.join(__dirname, '../config/credentials.json'));
    const token = fs.readJsonSync(path.join(__dirname, '../config/token.json'));
    // eslint-disable-next-line camelcase
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0],
    );
    oAuth2Client.setCredentials(token);
  } catch (err) {
    log.error('Failed to get oauth client', err);
    throw err;
  }
  const sheets = google.sheets({
    version: 'v4',
    auth: oAuth2Client,
  });
  getSpreadSheet = Promise.promisify(sheets.spreadsheets.values.get, {context: sheets});
  init = true;
}

async function fetchTimetableData(timetable) {
  const year = moment().format('Y');
  const {
    hash,
    name,
    prefix,
    spreadsheetId,
    disabled,
  } = timetable;
  const localLog = bunyan.createLogger({name: `anechka:sheets:${name}`});
  if (disabled) {
    localLog.info('timetable disabled');
    return true;
  }
  if (!caches.timeTables[hash]) {
    caches.timeTables[hash] = {};
  }
  let rows;
  try {
    const res = await getSpreadSheet({
      spreadsheetId,
      range: `timetable_${prefix}${year}!A1:Z33`,
    });
    rows = res.data.values;
  } catch (err) {
    localLog.warn(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
    throw err;
  }
  if (!rows || !rows.length) {
    localLog.warn('No data found.');
    return false;
  }
  const cols = transpose(rows);
  for (let month = 0; month < 12 && cols[month * 2] && cols[month * 2][0]; month++) {
    const realMonth = cols[month * 2][0];
    const dateColumn = cols[month * 2].slice(2);
    const devColumn = cols[month * 2 + 1].slice(2);
    dateColumn.forEach((row, index) => {
      if (!row || !devColumn[index]) {
        return;
      }
      caches.timeTables[hash][year] = caches.timeTables[hash][year] || {};
      caches.timeTables[hash][year][realMonth] = caches.timeTables[hash][year][realMonth] || {};
      caches.timeTables[hash][year][realMonth][row] = devColumn[index];
    });
  }
  // debug('Cached timetable: ', `${JSON.stringify(timeTableCache, null, 3)}`);
  await fs.writeJson('./current/timetable.json', caches.timeTables, {spaces: 3});
  return true;
}

async function fetchTimeTables() {
  if (caches.timeTables.lastUpdate && caches.timeTables.lastUpdate.isAfter(moment().subtract('30', 'minutes'))) {
    return true;
  }
  log.info('updating timetables');
  const uniqueTimeTables = config.tasks
    .map((timetable) => {
      return { ...timetable, hash: timeTableHash(timetable)};
    })
    .filter((el, index, arr) => {
      return arr.findIndex((item) => item.hash === el.hash) === index;
    });
  const results = await Promise.map(uniqueTimeTables, (timetable) => fetchTimetableData(timetable), {concurrency: 2});
  const success = results.every((el) => el);
  if (success) {
    caches.timeTables.lastUpdate = moment();
  }
  log.info(`timetables updated: ${success}`);
  return success;
}

async function fetchTimetableUsers(timetable) {
  const {
    hash,
    name,
    spreadsheetId,
  } = timetable;
  const localLog = bunyan.createLogger({name: `anechka:sheets:${name}`});
  if (!caches.users[hash]) {
    caches.users[hash] = {};
  }
  let rows;
  try {
    const res = await getSpreadSheet({
      spreadsheetId,
      range: 'users!A1:V40',
    });
    rows = res.data.values;
  } catch (err) {
    localLog.warn(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
    throw err;
  }
  if (!rows || !rows.length) {
    localLog.warn('No data found.');
    return false;
  }
  for (let i = 0; i < rows.length; i++) {
    const [user, slackName, isOwner] = rows[i];
    if (!user || !slackName) {
      break;
    }
    caches.users[hash][user] = slackName;
    if (isOwner && isOwner.toLowerCase() === 'owner') {
      caches.users[hash].owner = slackName;
    }
  }
  // debug('Cached users: ', `${JSON.stringify(userCache, null, 3)}`);
  await fs.writeJson('./current/users.json', caches.users, {spaces: 3});
  return true;
}

async function fetchUsers() {
  if (caches.users.lastUpdate && caches.users.lastUpdate.isAfter(moment().subtract('30', 'minutes'))) {
    return true;
  }
  log.info('fetching users');
  const uniqueTimeTables = config.tasks
    .map((timetable) => {
      return { ...timetable, hash: userTimeTableHash(timetable)};
    })
    .filter((el, index, arr) => {
      return arr.findIndex((item) => item.hash === el.hash) === index;
    });
  const results = await Promise.map(uniqueTimeTables, (timetable) => fetchTimetableUsers(timetable), {concurrency: 2});
  const success = results.every((el) => el);
  if (success) {
    caches.users.lastUpdate = moment();
  }
  log.info(`users fetched: ${success}`);
  return success;
}

module.exports = {
  fetchUsers,
  fetchTimeTables,
  initSpreadSheets,
};
