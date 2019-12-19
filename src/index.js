const mongo = require("./mongo");
const twitter = require("./twitter");
const express = require("express");
const bodyParser = require("body-parser");

const port = process.env.PORT || 3001;

// Middleware

const getTwitterAccounts = async (req, res, next) => {
  // Load a list of influencers with twitter accounts from DB
  res.body = await mongo.getTwitterAccounts();
  next();
};

const getTwitterProfiles = async (req, res, next) => {
  // Update accounts' twitter profile information
  const accounts = res.body;
  Promise.all(accounts.map(twitter.fetchTwitterProfile)).then(
    updatedAccounts => {
      res.body = updatedAccounts;
      next();
    }
  );
};

const updateTwitterProfiles = async (req, res, next) => {
  // For every account, update DB with twitter profile information
  const accounts = res.body;
  Promise.all(accounts.map(mongo.updateTwitterProfile)).then(() => next());
};

const getTweetStats = async (req, res, next) => {
  // Update all accounts with twitter statistics
  const accounts = res.body;
  Promise.all(accounts.map(twitter.fetchTwitterStats)).then(updatedAccounts => {
    res.body = updatedAccounts;
    next();
  });
};

const updateTwitterStats = async (req, res, next) => {
  // For every account, update statistics in DB
  const accounts = res.body;
  Promise.all(accounts.map(mongo.updateTwitterStats)).then(() => next());
};

const app = express();

app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader(
    "cache-control",
    "private, max-age=0, no-cache, no-store, must-revalidate"
  );
  res.setHeader("expires", "0");
  res.setHeader("pragma", "no-cache");
  next();
});

app.use(getTwitterAccounts);

app.get("/profiles", getTwitterProfiles, updateTwitterProfiles, (req, res) => {
  res.sendStatus(200);
});

app.get("/tweets", getTweetStats, updateTwitterStats, (req, res) => {
  res.sendStatus(200);
});

app.get(
  "/",
  getTwitterProfiles,
  updateTwitterProfiles,
  getTweetStats,
  updateTwitterStats,
  (req, res) => {
    res.sendStatus(200);
  }
);

app.listen(port, () =>
  console.log(`Twitter module is listening on port ${port}!`)
);

exports = app;
