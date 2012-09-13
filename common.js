// Require the configuration file
var config = require(__dirname + "/config.json");

var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var engine = require("engine.io");

module.exports = {
	url : require("url"),
	net : require('net'),
	fs : require("fs"),	
	startTime : new Date(2012, 9, 3, 21), //defaults to first debate right now, update this!
	
	mongo : new Db(config.mongo.db, new MongoServer(config.mongo.host, 27017, {strict:true})),
 	engine : engine.listen(8081, "0.0.0.0")
};
