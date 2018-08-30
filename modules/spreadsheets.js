'use strict';

const {google} = require('googleapis');
const moment = require('moment');
const config = require('config');
const Debug = require('debug');
const Promise = require('bluebird');
const fs = require('fs-extra');


const gobalDebug = Debug('anechka:sheets');
// Load client secrets from a local file.
const credentials = require('../config/credentials.json');
const token = require('../config/token.json');

const {
  transpose,
  timeTableHash,
  userTimeTableHash,
} = require('./utils');

const {
  timeTableCache,
  userCache,
} = require('./caches');

gobalDebug.enabled = true;

// eslint-disable-next-line camelcase
const {client_secret, client_id, redirect_uris} = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id, client_secret, redirect_uris[0],
);
oAuth2Client.setCredentials(token);

const sheets = google.sheets({
  version: 'v4',
  auth: oAuth2Client,
});
const getSpreadSheet = Promise.promisify(sheets.spreadsheets.values.get, {context: sheets});


async function updateTimetableData(timetable)
{
  const year = moment().format('Y');
  const {
    hash,
    name,
    prefix,
    spreadsheetId,
  } = timetable;
  const localDebug = Debug(`anechka:sheets:${name}`);
  localDebug.enabled = true;
  if (!timeTableCache[hash]) {
    timeTableCache[hash] = {};
  }
  let rows;
  try {
    const res = await getSpreadSheet({
      spreadsheetId,
      range: `timetable_${prefix}${year}!A1:Z33`,
    });
    rows = res.data.values;
  }
  catch (err) {
    localDebug(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
    throw err;
  }
  if (!rows || !rows.length) {
    localDebug('No data found.');
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
      timeTableCache[hash][year] = timeTableCache[hash][year] || {};
      timeTableCache[hash][year][realMonth] = timeTableCache[hash][year][realMonth] || {};
      timeTableCache[hash][year][realMonth][row] = devColumn[index];
    });
  }
  // debug('Cached timetable: ', `${JSON.stringify(timeTableCache, null, 3)}`);
  await fs.writeJson('./current/timetable.json', timeTableCache, {spaces: 3});
  return true;
}

async function updateTimeTables() {
  if (timeTableCache.lastUpdate && timeTableCache.lastUpdate.isAfter(moment().subtract('30', 'minutes'))) {
    return true;
  }
  gobalDebug('updating timetables');
  const uniqueTimeTables = config.timetables
    .map((timetable) => {
      return Object.assign({}, timetable, {hash: timeTableHash(timetable)});
    })
    .filter((el, index, arr) => {
      return arr.findIndex(item => item.hash === el.hash) === index;
    });
  const results = await Promise.map(uniqueTimeTables, timetable => updateTimetableData(timetable), {concurrency: 2});
  const success = results.every(el => el);
  if (success) {
    timeTableCache.lastUpdate = moment();
  }
  gobalDebug(`timetables updated: ${success}`);
  return success;
}

async function updateTimetableUsers(timetable)
{
  const {
    hash,
    name,
    spreadsheetId,
  } = timetable;
  const localDebug = Debug(`anechka:sheets:${name}`);
  localDebug.enabled = true;
  if (!userCache[hash]) {
    userCache[hash] = {};
  }
  let rows;
  try {
    const res = await getSpreadSheet({
      spreadsheetId,
      range: 'users!A1:V40',
    });
    rows = res.data.values;
  }
  catch (err) {
    localDebug(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
    throw err;
  }
  if (!rows || !rows.length) {
    localDebug('No data found.');
    return false;
  }
  for (let i = 0; i < rows.length; i++) {
    const [user, slackName] = rows[i];
    if (!user || !slackName) {
      break;
    }
    userCache[hash][user] = slackName;
  }
  // debug('Cached users: ', `${JSON.stringify(userCache, null, 3)}`);
  await fs.writeJson('./current/users.json', userCache, {spaces: 3});
  return true;
}

async function updateUsers() {
  if (userCache.lastUpdate && userCache.lastUpdate.isAfter(moment().subtract('30', 'minutes'))) {
    return true;
  }
  gobalDebug('updating users');
  const uniqueTimeTables = config.timetables
    .map((timetable) => {
      return Object.assign({}, timetable, {hash: userTimeTableHash(timetable)});
    })
    .filter((el, index, arr) => {
      return arr.findIndex(item => item.hash === el.hash) === index;
    });
  const results = await Promise.map(uniqueTimeTables, timetable => updateTimetableUsers(timetable), {concurrency: 2});
  const success = results.every(el => el);
  if (success) {
    userCache.lastUpdate = moment();
  }
  gobalDebug(`users updated: ${success}`);
  return success;
}

module.exports = {
  updateUsers,
  updateTimeTables,
};
