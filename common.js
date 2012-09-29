// Require the configuration file
var config = require(__dirname + "/config.json");

var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var ReplSetServers = require('mongodb').ReplSetServers;
var engine = require("engine.io");
var mongo;//

if (config.mongo.replica) {
	var servers = [];
	servers[0] = new MongoServer(config.mongo.host, config.mongo.port, {strict:true, auto_reconnect:true});
	servers[1] = new MongoServer(config.mongo.host2, config.mongo.port2, {strict:true, auto_reconnect:true});
	mongo = new Db(config.mongo.db, new ReplSetServers(servers));
	
	console.log('using repl set');
} else {
	mongo = new Db(config.mongo.db, new MongoServer(config.mongo.host, config.mongo.port, {strict:true})); 
}

var engine =  engine.listen(8081, "127.0.0.1");
var db_suffix = '_d0test';



var usingDoc = false; //JRO

function sendMessage(msg, log) {

	if (engine.clients) {

		// send msg
	  Object.keys(engine.clients).forEach(function(key) {
		  engine.clients[key].send(JSON.stringify(msg));
	  });
	  
	  //for printing all messages
	  console.log(msg);
	}

  // log msg
  if (log) {
	  mongo.collection('messages'+db_suffix, function(err, collection) {
			collection.insert(msg);
		});
	}	
}

function setWriteDb(db) {
	switch (db) {
		case '0':
			db_suffix = '_d0';
			break;
		case '1':
			db_suffix = '_d1';
			break;
		case '2':
			db_suffix = '_d2';
			
		case '0test':
			db_suffix = '_d0test';
			break;
		case '1test':
			db_suffix = '_d1test';
			break;
		case '2test':
			db_suffix = '_d2test';
			break;
			
		default:
			db_suffix = '_d0test';
			console.log('db name not recognized, using _d0test');
			break;
	}
	
	console.log("set db "+db_suffix +" "+ db);
	module.exports.db_suffix = db_suffix;
}

module.exports = {
	url : require('url'),
	net : require('net'),
	fs : require('fs'),	
	startTime : new Date(2012, 9, 3, 21), //defaults to first debate right now, update this!
	
	sendMessage : sendMessage,
	setWriteDb : setWriteDb,
	
	mongo : mongo,
	mongouser: config.mongo.user,
	mongopass: config.mongo.pass,
 	engine : engine,
 	async : require('async'),
 	db_suffix : db_suffix,
 	
 	// is there a live streaming debate
 	live : false,
 	
 	// is it initialized
 	initialized : false
};

