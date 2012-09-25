// Require the configuration file
var config = require(__dirname + "/config.json");

var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var engine = require("engine.io");
var mongo = new Db(config.mongo.db, new MongoServer(config.mongo.host, 27017, {strict:true}));
var engine =  engine.listen(8081, "0.0.0.0");

function sendMessage(msg, log) {

	if (engine.clients) {

		// send msg
	  Object.keys(engine.clients).forEach(function(key) {
		  engine.clients[key].send(JSON.stringify(msg));
	  });
	  
	  console.log(msg);
	}

  // log msg
  if (log) {
	  mongo.collection('messages', function(err, collection) {
			collection.insert(msg);
		});
	}	
}



module.exports = {
	url : require("url"),
	net : require('net'),
	fs : require("fs"),	
	startTime : new Date(2012, 9, 3, 21), //defaults to first debate right now, update this!
	
	sendMessage: sendMessage,
	
	mongo : mongo,
 	engine : engine,
 	async : require('async')
};

