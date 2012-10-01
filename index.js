 //for testing
var common = require('./common.js');
var cc = require('./ccHandler.js');
var stats = require('./statsHandler.js');


var tcpServer;
var ccSocket; //JRO
var doc;
var ind, nextInd;
var intervalID;

//JRO - Listening to terminal for disconnect commands
var stdin = process.openStdin();

//If we want to write a restart script it can go here
stdin.on('data', function(chunk) { 
	
	//trim the input
	var msg = chunk.toString().replace('\n', '');
	console.log("Input message: " + msg + "<"); 
	
	if (msg == 'close') 
	{
		if (ccSocket) {
			ccSocket.write('close\n', 'utf8', function() {
				console.log('closing existing CC socket');
			});
		}
	}
	
	else if (msg = 'test')
	{
		if (ccSocket) {
			ccSocket.write('test\n', 'utf8', function() {
				console.log('Testing CC socket ' + ccSocket.bytesWritten );
			});
		}
	}
	
	
});


//JRO shutdown code - listen to Ctrl-C events
process.on( 'SIGINT', function() {
  console.log( "\nRecon Backend shutting down from  SIGINT (Crtl-C)" );
  // some other closing procedures go here
  process.exit();
});


function start() {

	// Listen for input on stdin
	process.openStdin().on('data', function(chunk) { 
	
		//trim the input
		var msg = chunk.toString().replace('\n', '');
		console.log("Input message: " + msg + "<"); 
	
		if (msg.indexOf('use db') == 0) 
		{
			common.setWriteDb(msg.substring(7));
			clearDB(common.db_suffix);
			if (common.db_suffix == '_scratch') {
				//clearDB(common.db_suffix);
				unlockDb(true);
			}
			else unlockDb(false);
		}
		
		/*
		else if (msg.indexOf('clear db') == 0) 
		{
			clearDB(common.db_suffix);
		}
		*/
		
		else if (msg == 'unlock')
		{
			//JRO - setting the start time with an unlock
			common.startTime = new Date().getTime();
			unlockDb(true);
		}
		
		else if (msg == 'lock')
		{
			unlockDb(false);
		}
	
	});


	// on a 'connection' event
  common.engine.on("connection", function(socket) {
	
    //curSocket = socket;
    console.log("Connection " + socket.id + " accepted.");
    
    socket.on("message", function(msg) {
      msg = JSON.parse(msg);
      console.log(msg);

      switch (msg.event) {
        case "loadDoc":
        	loadDoc(msg.data["docName"], msg.data["delay"]);
        	break;
        case "loadHistory":
        	loadHistory();
        	break;
      }
    });
        
    socket.on("close", function(){
      //curSocket = null;
      console.log("Connection " + socket.id + " terminated.");
    });	    

  });
	
  // create tcp server for handling cc chars stream
  tcpServer = common.net.createServer();
	//Pass in null for host to bind server to 0.0.0.0. Then it will accept connections directed to any IPv4 address.
	tcpServer.listen(8088, null, function (){
		console.log('TCP server listening on ' + tcpServer.address().address + ':' + tcpServer.address().port);
	});
	
	tcpServer.on('connection', function(sock) {
	
		//Maintain a pointer to this
		ccSocket = sock;
		
		//We have a connection - a socket object is assigned to the connection automatically
		console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
						
		//Add a 'data' event handler to this instance of socket
		sock.on('data', function(data){
			
			//JRO - new Data Methods
			data = String(data);
			//console.log('');
			//console.log("data: "+data+" "+data.length);
			
			var msg = cc.stripTCPDelimiter(data);	
			//console.log(msg+" "+msg.length);		
			//process.stdout.write(msg);
			
			cc.handleChars(msg);
			
		});
		
		//Add a 'close' event handler to this instance of socket
		sock.on('close', function(data){
			console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
		});
		
		sock.on('exit', function()
		{
			console.log("here");
			sock.close();
		});
		
	});
	
	tcpServer.on('exit', function() {
		console.log("server exit");
		tcpServer.close();
	});
	
	tcpServer.on('error', function() {
		console.log("server error");
		tcpServer.close();
	});
	
	//JRO shutdown code
	process.on('exit', function () {
		
		console.log('Got "exit" event from REPL!');
		//now how do we close the server and all sockets?
		console.log('Server connections:' + tcpServer.connections);
		
		if (ccSocket) {
			ccSocket.write('close\n', 'utf8', function() {
				console.log('socket disconnect sent');
			});
			ccSocket.destroy();
		}
		
		tcpServer.close(function () {
			console.log("Closing server fron exit()");
		});
		
		console.log('Server connections:' + tcpServer.connections);
		process.exit();
		
	});

	// mongodb
	common.mongo.open(function(err, p_client) {
	
		common.initialized = true;
		
		// authenticate
		if (common.mongouser) {
		  common.mongo.authenticate(common.mongouser, common.mongopass, function(err, p_client) { 
		  }); 
		}
	
	  //default to scratch db, clear it, and unlock it
	  common.setWriteDb('scratch');
	  clearDB('scratch');
	  unlockDb(true);

		setInterval(stats.sendStats, 5000);
		//setInterval(stats.sendStats, 50000); //test	
		
	});

    
}

// do it
start();


function clearDB(dbName)
{

	console.log('Clear DB:' + dbName);	

	//clear out all the collections
	common.mongo.collection("messages"+dbName, function(err, collection) {
		collection.remove(function(err, result) {});
	});
	common.mongo.collection("word_instances"+dbName, function(err, collection) {
		collection.remove(function(err, result) {});
	});
	common.mongo.collection("sentence_instances"+dbName, function(err, collection) {
		collection.remove(function(err, result) {});
	});
	common.mongo.collection("unique_words"+dbName, function(err, collection) {
		collection.remove(function(err, result) {});
	});
	
	//ngrams
	for (var j=2; j<5; j++) {
		common.mongo.collection("unique_"+j+"grams"+dbName, function(err, collection) {
			collection.remove(function(err, result) {});
		});
	}

}

function unlockDb(flag)
{
	common.unlockDb(flag);
}


function loadDoc(docName, delay) {

	console.log("d "+delay+" n "+docName);
	
	common.usingDoc = true; //JRO
	
	// reset start date
	common.startTime = new Date().getTime();
		
	try {
		doc = common.fs.readFileSync(__dirname + '/documents/' + docName, 'utf8');
		
		if (delay == 0) {
			cc.handleChars(doc);
			cc.sendEndMessage();
		} else {
			ind = 0;
			nextInd = 0;
			clearTimeout(intervalID);
			intervalID = setInterval(sendCharsFromDoc, delay);
		}
	} catch (e) {
		console.log(e);
	}		
}

function loadHistory() {
		common.mongo.collection('messages'+common.db_suffix, function(err, collection) {
		collection.find(function(err, cursor) {
			cursor.each(function(err, msg) { 
				console.log("SEND "+msg);
				// PEND only send to client requesting!
				common.sendMessage(msg, false);
			});
		});
	});	
}

function sendCharsFromDoc() {

	if (ind < doc.length) {
		nextInd = Math.min(ind + Math.floor((Math.random()*3)+1), doc.length);
		cc.handleChars(doc.substring(ind, nextInd));
		ind = nextInd;
	}
	else {
		clearTimeout(intervalID);
		cc.sendEndMessage();
	}
	
}

