var net = require("net");
var spawn = require("child_process").spawn;
var port = 3213;
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
		data = data.toString().slice(0, data.length-2);
		
		// first handle splits

		var word = "";
		var entity = false;
		var words = data.split(' ');
		for (var i=0; i<words.length; i++) {
			var parts = words[i].split('/');
			word += parts[0];
			if (parts[1].length > 1 || parts[0].toLowerCase() == 'i' || start) {
					entity = true;
			}
		}
		
		
		// clean backtick
		word = word.replace("`", "\'");
		
		if (entity) {
			done(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
		} else {
			done(word.toLowerCase());
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

/*process.on("uncaughtException", function(ex) {
  console.log('named-entity - uncaughtException - exiting…'+ex);
  process.exit();
});*/

process.on("disconnect", function() {
  console.log('disconnect - exiting…');
  process.exit();
});
