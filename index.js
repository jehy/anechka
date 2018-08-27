'use strict';

const {google} = require('googleapis');
const moment = require('moment');
const config = require('config');
const debug = require('debug')('devDuty:server');
const Promise = require('bluebird');
const Slack = require('slack');
const fs = require('fs-extra');


// Load client secrets from a local file.
const credentials = require('./config/credentials.json');
const token = require('./config/token.json');

const slackBot = new Slack({token: config.token});

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
const slackUserCache = {};

async function updateTimeTables() {
  const year = moment().format('Y');
  const uniqueTimeTables = config.timetables
    .map((timetable) => {
      return Object.assign({}, timetable, {hash: timeTableHash(timetable)});
    })
    .filter((el, index, arr) => {
      return arr.findIndex(item => item.hash === el.hash) === index;
    });
  return Promise.map(uniqueTimeTables, async (timetable) => {
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
      throw err;
    }
    if (!rows || !rows.length) {
      debug('No data found.');
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
    return fs.writeJson('./current/timetable.json', {spaces: 3});

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
  return Promise.map(uniqueTimeTables, async (timetable) => {
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
      throw err;
    }
    if (!rows || !rows.length) {
      debug('No data found.');
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
    return fs.writeJson('./current/users.json', {spaces: 3});
  }, {concurrency: 2});
}

async function updateSlackUsers() {
  const users = await slackBot.users.list();
  if (!users.ok) {
    debug(`updateSlackUsers error, smth not okay: ${users}`);
    return false;
  }
  users.members.forEach((user) => {
    slackUserCache[user.name] = user.id;
  });
  // debug(`SlackUserCache: ${JSON.stringify(slackUserCache, null, 3)}`);
  return fs.writeJson('./current/slackUsers.json', {spaces: 3});
}

async function updateSlackUserName(options) {
  const {
    group,
    channel,
    devIndex,
    devName,
  } = options;
  let topic;
  if (group)
  {
    const channelData = await slackBot.groups.info({channel: group});
    if (!channelData.ok) {
      debug(`updateSlackUserName error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.group.topic.value;
  }
  else {
    const channelData = await slackBot.channels.info({channel});
    if (!channelData.ok) {
      debug(`updateSlackUserName error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.channel.topic.value;
  }
  debug(`Current topic: ${topic}`);
  const findUsers = /<@[A-Z0-9]+>/g;
  const foundUsers = topic.match(findUsers);
  debug(`Found users: ${foundUsers}`);
  if (!foundUsers) {
    debug('users not found in topic!');
    return false;
  }
  if (!foundUsers[devIndex]) {
    debug(`users with index ${devIndex} not found in topic!`);
    return false;
  }
  const devId = slackUserCache[devName];
  if (!devId) {
    debug(`Developer ${devName} not found in cache!`);
    return false;
  }
  const newTopic = topic.replace(foundUsers[devIndex], `<@${devId}>`);
  if (newTopic === topic) {
    debug('current dev already set, nothing to do');
    return true;
  }
  debug(`Setting topic ${newTopic}`);
  let response;
  if (group)
  {
    response = await slackBot.groups.setTopic({
      channel: group,
      topic: newTopic,
    });
  }
  else
  {
    response = await slackBot.channels.setTopic({
      channel,
      topic: newTopic,
    });
  }
  return response && response.ok === true;
}

async function updateSlack() {
  const year = moment().format('Y');
  const month = moment().format('M');
  const day = moment().format('D');
  return Promise.map((config.timetables), async (timetable) => {
    const calendar = timeTableCache[timeTableHash(timetable)];
    const users = userCache[usertimeTableHash(timetable)];
    if (!calendar) {
      debug(`No calendar data for timetable ${JSON.stringify(timetable, null, 3)}`);
      return false;
    }
    if (!users) {
      debug(`No calendar data for timetable ${JSON.stringify(timetable, null, 3)}`);
      return false;
    }
    const updateTime = moment(moment().format(`YYYY-MM-DD ${timetable.updateTime}`), 'YYYY-MM-DD HH:mm:ss');
    debug(`Update time: ${updateTime.format('YYYY-MM-DD HH:mm:ss')}`);
    const {lastUpdate} = timetable;
    if (lastUpdate) {
      debug(`lastUpdate: ${lastUpdate.format('YYYY-MM-DD HH:mm:ss')}`);
    }
    else {
      debug('lastUpdate: none');
    }
    if (!lastUpdate || moment().isAfter(updateTime) && updateTime.isAfter(lastUpdate)) {
      debug('Need update!');

      let timetableNotFound = false;
      if (!calendar[year])
      {
        debug(`There is no timetable for year ${year}!`);
        timetableNotFound = true;
      }
      else if (!calendar[year][month])
      {
        debug(`There is no timetable for month ${month}!`);
        timetableNotFound = true;
      }
      else if (!calendar[year][month][day])
      {
        debug(`There is no timetable for day ${day}!`);
        timetableNotFound = true;
      }
      if (timetableNotFound)
      {
        timetable.lastUpdate = moment();
        return true;
      }
      const currentDevName = calendar[year][month][day];

      const currentDevSlackName = users[currentDevName];
      if (!currentDevSlackName)
      {
        debug(`User not found for name ${currentDevName}`);
        timetable.lastUpdate = moment();
        return true;
      }
      try {
        const options = {
          group: timetable.group,
          channel: timetable.channel,
          devIndex: timetable.devIndex || 0,
          devName: currentDevSlackName,
        };
        const res = await updateSlackUserName(options);
        if (res) {
          timetable.lastUpdate = moment();
          return true;
        }
        return false;
      }
      catch (err) {
        debug(`Failed to set current dev for channel ${timetable.group}${timetable.channel}: ${err}`);
      }
      debug('Updated.');
    }
    debug('No need for update.');
    return false;
  }, {concurrency: 2});
}

const updateInterval = 1000 * 60 * 30;// every half an hour
// const updateInterval = 1000 * 20;// every 60 second
async function run() {
  return Promise.all([updateTimeTables(), updateUsers(), updateSlackUsers()])
    .then(() => {
      return updateSlack();
    })
    .catch((err) => {
      debug(`ERR: ${err}`);
    });
}

async function start() {
  await run();
  setInterval(() => run(), updateInterval);
}

start();
