// Require the configuration file
var config = require(__dirname + "/config.json");

var fs = require("fs");
var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var ReplSetServers = require('mongodb').ReplSetServers;
var engine = require("engine.io");
var mongo;//
var phantom = require("phantom");

if (config.mongo.replica) {
	var servers = [];
	servers[0] = new MongoServer(config.mongo.host, config.mongo.port, {strict:true, auto_reconnect:true});
	servers[1] = new MongoServer(config.mongo.host2, config.mongo.port2, {strict:true, auto_reconnect:true});
	mongo = new Db(config.mongo.db, new ReplSetServers(servers));
	
	//console.log('using repl set');
} else {
	mongo = new Db(config.mongo.db, new MongoServer(config.mongo.host, config.mongo.port, {strict:true})); 
}

var engine =  engine.listen(8081, "127.0.0.1");

var db_suffix = '_scratch';
var unlock_db = false;

var usingDoc = false; //JRO

var page;

// Set up the headless environment.
phantom.create(function(ph) {
  ph.createPage(function(p) {
    p.open("http://localhost:8000/?nosocket=true", function(status) {
      // The page is now ready to accept messages.
      page = p;

      // Alter the viewport to something more common towards the iPad
      // resolution.
      page.set("viewportSize", { width: 1024, height: 768 });

      // Save on performance... any more options we should set?
      page.set("settings.loadImages", false);
    });
  });
});

function sendMessage(msg, log) {

	if (engine.clients) {

		// send msg
	  Object.keys(engine.clients).forEach(function(key) {
		  engine.clients[key].send(JSON.stringify(msg));
	  });
	  
	  //for printing all messages
	  //console.log(msg);
	}

	updatePhantom(msg);

  // log msg
  if (log) {
	  mongo.collection('messages'+db_suffix, function(err, collection) {
			collection.insert(msg);
		});
	}	
}


function sendLiveState(socket)
{
	var db = -1;
	
	if (unlock_db)
	{
		if (db_suffix == '_d0' || db_suffix == '_d0test') db = 0;
		else if (db_suffix == '_d1' || db_suffix == '_d1test') db = 1;
		else if (db_suffix == '_d2' || db_suffix == '_d2test') db = 2;
		else db = -1; //using -1 if scratch db is selected
	}

	var msg = {
		type: "livestate",
		debate: db
	};
	
	//if socket is provided, send only to that socket
	if (socket) {
		console.log("CONNECT: sending live state: " + JSON.stringify(msg)); 
		socket.send(JSON.stringify(msg)); 
	}
	else
	{
		//console.log("HEARTBEAT: sending live state: " + JSON.stringify(msg));
		Object.keys(engine.clients).forEach(function(key) {
		  engine.clients[key].send(JSON.stringify(msg));
	  });
	  
	  updatePhantom(msg);
	}
  
	
}


function updatePhantom(msg) {
  if (page) {
    // Send the message to the page directly.
    // I know, I know.  I'm doing a lot here, this should be most probably be
    // refactored.
    page.evaluate(function(message) {
      // shit code, rethink...
      window.require(["app"], function(app) { app.handleMessage(message) });

      return [window.document.querySelector("#transcript > .wrapper").innerHTML,
      window.document.querySelector("#bigWordsHolder").innerHTML];
    }, function(result) {
    	if (result) {
      	fs.writeFile("../recon_frontend/live.html", result[0]);
      	fs.writeFile("../recon_frontend/live_bigwords.html", result[1]);
      } else console.log("err no res");
    }, msg);
  }
  
  
  // Append the message to the temporary messages file.
  fs.appendFile('../recon_frontend/messages/' + db_suffix, JSON.stringify(msg) + '\n');	
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
			
		//JRO - using scratch DB as the default	
		case 'scratch':
			db_suffix = '_scratch';
			break;
			
		default:
			db_suffix = '_scratch';
			//console.log('db name not recognized, using _scratch');
			break;
	}
	
	//console.log("set db "+db_suffix +" "+ db);
	module.exports.db_suffix = db_suffix;
	
}

function unlockDb(unlock)
{
  //console.log("Unlock DB:"+db_suffix+ " Set:"+unlock);
	unlock_db = unlock;
}

function dbUnlocked()
{
	return unlock_db;
}



module.exports = {
	url : require('url'),
	net : require('net'),
	fs : fs,	
	
	//JRO - now setting start time when you unlock a db
	startTime : new Date(2012, 9, 3, 21), //defaults to first debate right now, update this!
	
	lastCCTime : new Date().getTime(),
	
	sendMessage : sendMessage,
	setWriteDb : setWriteDb,
	
	mongo : mongo,
	mongouser: config.mongo.user,
	mongopass: config.mongo.pass,
 	engine : engine,
 	async : require('async'),
 	db_suffix : db_suffix,
 	
 	unlockDb : unlockDb,
 	dbUnlocked : dbUnlocked,
 	
 	sendLiveState : sendLiveState,
 	
 	// is there a live streaming debate
 	live : false,
 	
 	// is it initialized
 	initialized : false
};

