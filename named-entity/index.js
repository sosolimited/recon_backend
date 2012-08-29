var net = require("net");
var spawn = require("child_process").spawn;
var port = 3214;
var classifier = "english.all.3class.distsim.crf.ser.gz";

// Spawn the sentiment strength jar application
var java = spawn("java", [ "-mx500m", "-cp",
	__dirname + "/stanford-ner.jar",
	"edu.stanford.nlp.ie.NERServer",
	"-port", port,
	"-loadClassifier", __dirname + "/classifiers/" + classifier ]);


module.exports = function(msg, start, done) {
	
	var socket = net.connect(port, function() {
		socket.write(msg + "\n");
	});
	
	// Ensure errors can be accounted for...
	socket.on("error", function() {});
	
	socket.on("data", function(data) {
		//console.log("data "+data);
		var parts = data.toString().split('/');
		if (parts.length > 0) {
			if (parts[1].toString().length != 3 || start) {
				done(parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase());
			} else {
				done(parts[0].toLowerCase());
			}
		}
	});
	
 };

// Clean up
process.on("exit", function(code) {
  console.log('child process exited with code ' + code);
  java.kill();
  
  //spawn a new one
  java = spawn("java", [ "-mx500m", "-cp",
	  __dirname + "/stanford-ner.jar",
	  "edu.stanford.nlp.ie.NERServer",
	  "-port", port,
	  "-loadClassifier", __dirname + "/classifiers/" + classifier ]);
});

//process.on("uncaughtException", function() {
//  console.error.apply(console, arguments);
//  console.log('uncaughtException - exiting…');
//  process.exit();
//});

process.on("disconnect", function() {
  console.log('disconnect - exiting…');
  process.exit();
});
