'use strict';

const {google} = require('googleapis');
const moment = require('moment');
const config = require('config');
const debug = require('debug')('devDuty:server');
const Promise = require('bluebird');


// Load client secrets from a local file.
const credentials = require('./config/credentials.json');
const token = require('./config/token.json');


debug.enabled = true;

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

function transpose(a) {
  return Object.keys(a[0]).map(c => a.map(r => r[c]));
}

function timeTableHash(timetable) {
  return `${timetable.spreadsheetId}${timetable.prefix}`;
}

function usertimeTableHash(timetable) {
  return `${timetable.spreadsheetId}`;
}

const timeTableCache = {};
const userCache = {};

async function updateTimeTables() {
  const year = moment().format('Y');
  const uniqueTimeTables = config.timetables
    .map((timetable) => {
      return Object.assign({}, timetable, {hash: timeTableHash(timetable)});
    })
    .filter((el, index, arr) => {
      return arr.findIndex(item => item.hash === el.hash) === index;
    });
  Promise.map(uniqueTimeTables, async (timetable) => {
    const {prefix, spreadsheetId} = timetable;
    const {hash} = timetable;
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
      debug(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
      setTimeout(() => process.exit(1), 1000);
    }
    if (rows && rows.length) {
      const cols = transpose(rows);
      for (let month = 0; month < 12 && cols[month * 2] && cols[month * 2][0]; month++) {
        const realMonth = cols[month * 2][0];
        debug(`Found month ${realMonth}`);
        const dateColumn = cols[month * 2].slice(2);
        const devColumn = cols[month * 2 + 1].slice(2);
        dateColumn.forEach((row, index) => {
          if (!row || !devColumn[index]) {
            return;
          }
          debug(`${row}: ${devColumn[index]}`);
          timeTableCache[hash][year] = timeTableCache[hash][year] || {};
          timeTableCache[hash][year][realMonth] = timeTableCache[hash][year][realMonth] || {};
          timeTableCache[hash][year][realMonth][row] = devColumn[index];
        });
      }
      debug('Cached timetable: ', `${JSON.stringify(timeTableCache, null, 3)}`);
    } else {
      debug('No data found.');
    }
  }, {concurrency: 2});
}

async function updateUsers() {
  const uniqueTimeTables = config.timetables
    .map((timetable) => {
      return Object.assign({}, timetable, {hash: usertimeTableHash(timetable)});
    })
    .filter((el, index, arr) => {
      return arr.findIndex(item => item.hash === el.hash) === index;
    });
  Promise.map(uniqueTimeTables, async (timetable) => {
    const {spreadsheetId} = timetable;
    const {hash} = timetable;
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
      debug(`The API returned an error for timetable ${JSON.stringify(timetable)}: ${err}`);
      setTimeout(() => process.exit(1), 1000);
    }
    if (rows && rows.length) {
      for (let i = 0; i < rows.length; i++) {
        const [user, slackName] = rows[i];
        if (!user || !slackName) {
          break;
        }
        userCache[hash][user] = slackName;
      }
      debug('Cached users: ', `${JSON.stringify(userCache, null, 3)}`);
    } else {
      debug('No data found.');
    }
  }, {concurrency: 2});
}

updateTimeTables();
updateUsers();
