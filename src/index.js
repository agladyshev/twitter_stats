'use strict' 

const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const assert = require('assert');
const Twitter = require('twitter');
const moment = require('moment');
require('dotenv').config();

const port = process.env.PORT || 3000;

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}${process.env.DB_HOST}/test?retryWrites=true`;

// Twitter API calls

const fetchTwitterProfile = async (account) => {
  const uri = account.twitter_id ?
  `https://api.twitter.com/1.1/users/show.json?user_id=${account.twitter_id}` :
  `https://api.twitter.com/1.1/users/show.json?screen_name=${account.twitter_name}`;
  await client.get(uri, {})
  .then(function (body) {
    const {
      id_str: twitter_id,
      screen_name: twitter_name,
      followers_count: twitter_followers,
      statuses_count: tweets,
      profile_image_url: twitter_pic,
    } = body;
    const twitter_status = 'OK';
    account = Object.assign(account, {
      twitter_id, twitter_name, twitter_followers, tweets, twitter_pic, twitter_status});
    })
    .catch(function (error) {
      const twitter_status = error[0].message;
      account = Object.assign(account, {twitter_status});
    })
    return await account;
};

const fetchProfileStats = async (account) => {
  const uri = `https://api.twitter.com/1.1/statuses/user_timeline.json?user_id=${account.twitter_id}&trim_user=true&exclude_replies=true&include_rts=false`;
  await client.get(uri, {})
  .then(function (tweets) {
    const twitter_stats = tweets.reduce(function(accumulator, tweet, index) {
      // Filter tweets with a selected period of time
      if (moment(tweet.created_at, 'dd MMM DD HH:mm:ss ZZ YYYY', 'en')
        .isAfter(moment().subtract(process.env.STATS_SINCE_DAYS, 'days'))) {
        accumulator.retweets_recent = accumulator.retweets_recent + tweet.retweet_count;
        accumulator.favorites_recent = accumulator.favorites_recent + tweet.favorite_count;
        accumulator.tweets_recent += 1;
      }
      return accumulator;
    }, {retweets_recent: 0, favorites_recent: 0, tweets_recent: 0});
    const twitter_status = 'OK';
    account = Object.assign(account, twitter_stats, {twitter_cycle: process.env.STATS_SINCE_DAYS});
  })
  .catch(function (error) {
    const twitter_status = error[0].message;
    account = Object.assign(account, {twitter_status});
  })
  return await account;
}

const getTwitterAccounts = async (req, res, next) => {
  // Collect a list of influencers with twitter accounts
  let accounts;
  try {
    const client = await MongoClient.connect(uri, { useNewUrlParser: true });
    
    const db = client.db(process.env.DB_NAME);
    
    const col = db.collection('influencers');
    
    accounts = await col.find({twitter_name: {$gt: ''}}).project({twitter_name:1, twitter_id:1}).toArray();
    
    client.close();
  } catch (e) {
    console.error(e);
  }
  res.body = accounts;
  next();
  // return accounts;
};

// MongoDB API calls

const updateMongoProfile = async (account) => {
  // Update twitter stats in database
  try {
    const client = await MongoClient.connect(uri, { useNewUrlParser: true });
    const db = client.db(process.env.DB_NAME);
    const col = db.collection('influencers');
    col.updateOne(
      { _id: account._id }
      , {
        $set: {
          twitter_id: account.twitter_id,
          twitter_name: account.twitter_name,
          twitter_followers: account.twitter_followers,
          tweets: account.tweets,
          twitter_pic: account.twitter_pic,
          twitter_status: account.twitter_status,
          twitter_updated: Date.now(),
        }
      }, function(err, result) {
        assert.equal(err, null);
        assert.equal(1, result.result.n);
    });
    client.close();
  } catch (e) {
    console.error(e);
  }
};

const updateMongoTweets = async (account) => {
  // Update tweets stats in the database
  try {
    const client = await MongoClient.connect(uri, { useNewUrlParser: true });
    const db = client.db(process.env.DB_NAME);
    const col = db.collection('influencers');
    col.updateOne(
      { _id: account._id }
      , {
        $set: {
          twitter_retweets_recent: account.retweets_recent,
          twitter_favorites_recent: account.favorites_recent,
          tweets_recent: account.tweets_recent,
          twitter_cycle: account.twitter_cycle,
          twitter_status: account.twitter_status,
          tweets_updated: Date.now(),
        }
      }, function(err, result) {
        assert.equal(err, null);
        assert.equal(1, result.result.n);
    });
    client.close();
  } catch (e) {
    console.error(e);
  }
};

// Middleware

const getTwitterProfiles = async (req, res, next) => {
  // Call twitter for updated profile information
  const accounts = res.body;
  Promise.all(accounts.map(fetchTwitterProfile))
  .then(updatedAccounts => {
    res.body = updatedAccounts;
    next();
  })
};

const updateTwitterProfiles = async (req, res, next) => {
  // Call twitter for updated profile information
  const accounts = res.body;
  Promise.all(accounts.map(updateMongoProfile))
  .then(res => next())
};

const getTweetStats = async (req, res, next) => {
  // Call twitter for user tweets
  const accounts = res.body;
  Promise.all(accounts.map(fetchProfileStats))
  .then(updatedAccounts => {
    res.body = updatedAccounts;
    next();
  })
};

const updateTweetStats = async (req, res, next) => {
  // Call twitter for updated profile information
  const accounts = res.body;
  Promise.all(accounts.map(updateMongoTweets))
  .then(res => next())
};

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('cache-control', 'private, max-age=0, no-cache, no-store, must-revalidate');
  res.setHeader('expires', '0');
  res.setHeader('pragma', 'no-cache');
  next();
});

app.use('/', getTwitterAccounts);

app.get('/profiles', getTwitterProfiles, updateTwitterProfiles, (req, res) => {
  res.sendStatus(200);
});

app.get('/tweets', getTweetStats, updateTweetStats, (req, res) => {
  res.sendStatus(200);
});

app.get('/',
  getTwitterProfiles,
  updateTwitterProfiles,
  getTweetStats,
  updateTweetStats,
  (req, res) => {
    res.sendStatus(200);
  }
);

app.listen(port, () => console.log(`Twitter module is listening on port ${port}!`));