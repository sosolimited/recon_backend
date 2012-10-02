var common = require('./common.js');
// Include the stanford named-entity recognition
var namedentity = require(__dirname + "/named-entity");
// Include sentistrength
var sentistrength = require(__dirname + "/sentistrength");

//These variables need to remain global so that we can add to the buffers periodically
var curWordBuffer = "";
var curSentenceBuffer = "";
var curEventID = 0;
var curSpeaker = 0;
var sentenceStartF = true;
var cur2Gram = [];
var cur3Gram = [];
var cur4Gram = [];
var minNGramOccurrences = 4;

//MongoDB stuff
var curSentenceID = 0;

//Regular Expressions
//var wordRegExp = new RegExp(/[\s \! \? \; \( \) \[ \] \{ \} \< \> "]|,(?=\W)|[\.\-\&](?=\W)|:(?!\d)/g);
//var sentenceRegExp = new RegExp(/[\.|\?|\!]\s/g);
//var sentenceRegExp = new RegExp(/[\.|\?|\!]/);
//var abrevRegExp = new RegExp(/(Mr|Mrs|Ms|Dr|Sr|U\.S|D\.C)$/i);

var spaceRegEx = new RegExp(/\S{1,}/g);
var leadPunctRegEx = new RegExp(/^[\"|\'|>|<|\-|\+|\[|\{|$]{1,}/); //JRO edit
var numberRegEx = new RegExp(/\d{1,}.{1,}\d{1,}/);
var abbrevRegEx = new RegExp(/\w{1,}[\'|\-]\w{1,}/); //JRO edit
var wordRegEx = new RegExp(/\w{1,}/);
var sentenceEndRegEx = new RegExp(/[\.|\?|\!]/);

//Called from outside of 
function handleChars(newChars)
{
	//console.log(newChars);
	//process.stdout.write(newChars);

	//1. add chars to current word
	curWordBuffer += newChars;

	//2. add chars to current sentence
	curSentenceBuffer += newChars;

	//3. find the words in the buffer
	curWordBuffer = parseWords(curWordBuffer);

}

//Function takes a buffer and pulls out any words
function parseWords(text)
{

	//return elements
	var returnBuf = "";

	//split input string with RegExo
	var tokens = text.match(spaceRegEx);
	var substrL = 0;

	for (i in tokens) //JRO - hack to only process one token at a time
	{
		//If the element isn't the last in an array, it is a new word
		//if ((i<tokens.length - 1) && tokens[i] !== "")
		if ((i == 0) && (i<tokens.length - 1) && tokens[i] !== "") //JRO - hack to only process one token at a time
		//if ((i == 0) && (i<tokens.length - 1))
		{
			var tok = tokens[i];
			
			console.log("");
			console.log("tok:"+tok + " l:"+tok.length );

			substrL += tokens[i].length+1;

			// strip any leading punctuation
			var leadPunct = tok.match(leadPunctRegEx);
			if (leadPunct) {
				//NOTE: substring was not working correctly ... might actually be length that was off
				//using replace instead
				tok = tok.replace(leadPunct, "");
				console.log('lead p ' + leadPunct);
			}
			//console.log("tok1:"+tok);

			// pull any numbers

			var word;
			var sentenceEnd = false;

			var numWord = tok.match(numberRegEx);
			if (numWord) {
				console.log('number');
				word = numWord;
			}
			//console.log("tok2:"+tok);

			// pull any abbreviations
			// PEND: broken 
			var abbrevWord = tok.match(abbrevRegEx);
			if (abbrevWord && !word) {
				console.log('abbrev');
				word = abbrevWord;
			}
			//console.log("tok3:"+tok);

			// pull out word
			var plainWord = tok.match(wordRegEx);
			if (plainWord && !word) {
				word = plainWord;
			}
			//console.log("tok4:"+tok);

			if (word) console.log("Word: " + word);

			//look for final punctutation, the leftovers
			var endPunct = tok.replace(word, "");
			if (endPunct) console.log('punct ' + endPunct);

			// check if sentence end
			if (endPunct.search(sentenceEndRegEx) != -1) {
				sentenceEnd = true;
				console.log('END SENTENCE');
			}

			var speakerSwitch = false;

			//spealer switching handled with special words
			if (word && common.usingDoc)
			{			
				if (word == "MODERATOR" || word == "QUESTION" || word == "BROKAW" || word == "IFILL") {
					curSpeaker = 0;
					speakerSwitch = true;
				}
				else if (word == "OBAMA" || word == "BIDEN") {
					curSpeaker = 1;
					speakerSwitch = true;
				}
				else if (word == "MCCAIN" || word == "ROMNEY" || word == "PALIN") {
					curSpeaker = 2;
					speakerSwitch = true;
				}
			}

			//words for live uploading
			else if (word)
			{
				if (word == "SPEAKER_MODERATOR") {
					curSpeaker = 0;
					speakerSwitch = true;
				}
				else if (word == "SPEAKER_OBAMA") {
					curSpeaker = 1;
					speakerSwitch = true;
				}
				else if (word == "SPEAKER_ROMNEY") {
					curSpeaker = 2;
					speakerSwitch = true;
				}
			}


			namedentity(word, sentenceStartF, function(resp) {
				if (common.dbUnlocked()) handleWord(curSpeaker, leadPunct, resp, endPunct, sentenceEnd, speakerSwitch); 
				else console.log ('parseWords(): DB is Locked, not adding data');
			});



		}
		//Otherwise this should be returned as part of the buffer
		else {
			returnBuf = text.substring(substrL);
		}
	}

	//return both the current buffer and the found words
	return returnBuf;

}

function handleWord(speaker, leadPunct, w, endPunct, sentenceEnd, speakerSwitch)
{	

	console.log("HANDLE WORD "+leadPunct+" "+w+" "+endPunct+" speaker "+speaker);
	var curWordID = new common.mongo.bson_serializer.ObjectID(); 
	var timeDiff = new Date().getTime() - common.startTime;

	// if new sentence, generate ID and insert into sentence_instances

	var funcs = [
	    function(cb) { // log sentence
	    	logSentence(speaker, curWordID, timeDiff, cb);
	    },

	    function(cb) { // look up categories
		  	getCats(w, cb);
	    },

	    function(cats, cb) { // log unique word
		    //console.log("cats "+cats);
		    logUniqueWord(curWordID, w, cats, cb);
	    },

	    function(uniqueWDoc, cb) { // log word instance
		    //console.log("uniqueWDoc "+uniqueWDoc);
	   		logWordInstance(speaker, curWordID, uniqueWDoc, timeDiff, cb);
	   	},

	    function(uniqueWDoc, cb) { // process 4 grams
				processNGrams(4, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, [], cb);
			},

	    function(uniqueWDoc, ngrams, cb) { // process 3 grams
				processNGrams(3, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},

	    function(uniqueWDoc, ngrams, cb) { // process 2 grams
				processNGrams(2, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},

			function(uniqueWDoc, ngrams, cb) { // send punctuation
				//console.log('Before:'+uniqueWDoc.word);
				if (leadPunct) {
					//console.log("lead punct");
					if (leadPunct != ' ' && leadPunct != '\n') // && leadPunct.length == 1) length is not working well here
						//sendWord(cb, timeDiff - 1, speaker, uniqueWDoc, leadPunct, true, ngrams); //JRO - arguments were missing, punctFlag now -1,0,1
						sendWord(cb, timeDiff - 1, speaker, uniqueWDoc, leadPunct, -1, ngrams);
					else cb(null, uniqueWDoc, ngrams);	

				} 
				else cb(null, uniqueWDoc, ngrams);
			},

			function(uniqueWDoc, ngrams, cb) { // send word
				//console.log('After:'+uniqueWDoc.word);
				if (!speakerSwitch)
					//console.log('About to send:'+w+' uniqueWDoc.word:'+uniqueWDoc.word);
					if (uniqueWDoc.word != 'Undefined' && (uniqueWDoc.word != 'undefined')) sendWord(cb, timeDiff, speaker, uniqueWDoc, uniqueWDoc.word, 0, ngrams);	//, punctFlag now -1,0,1
			},

			function(uniqueWDoc, ngrams, cb) { // send punctuation
				if (endPunct) {
					if (endPunct != ' ' && endPunct != '\n') //  && endPunct.length == 1) length is not working here
						sendWord(cb, timeDiff + 1, speaker, uniqueWDoc, endPunct, 1, ngrams); //JRO - arguments were missing , punctFlag now -1,0,1
					else cb(null, uniqueWDoc, ngrams);	
				} 
				else cb(null, uniqueWDoc, ngrams);
			},
			function(uniqueWDoc, ngrams, cb) {
				if (sentenceEnd) 
					handleSentenceEnd(timeDiff, speaker, cb)
				else {
					cb(null);
				}
			}
	];

	var cb = function(err, res) {
	    console.log(arguments);
	};

	common.async.waterfall(funcs, cb);


}


function getCats(w, cb) {

	var cats = [];

	//looking for any digit within the string
	if (w.search(/\d/) != -1) {
		cats.push('numbrz');
	}
	
	//adding six letter words
	if (w.length >= 7) {
		cats.push('sixltr');
	}

	common.mongo.collection('LIWC', function(e, c) {
		// first check if it's in LIWC (non wildcard)
		c.findOne({'word':w.toLowerCase()}, function(err, doc) {

			// add categories
			if (doc) {
				//console.log("NORMAL "+w);
				cb(null, cats.concat(doc.cat));
			} 

			//TODO: This needs to be fixed, currently not working
			else { // if not found, check wildcards
				common.mongo.collection('LIWC_wildcards', function(e, c) {
					c.findOne({$where: "'"+w.toLowerCase()+"'.indexOf(this.word) == 0" }, function(err, wdoc) {
						if (wdoc) {
							console.log("WILDCARD:" + w + " CAT:" + wdoc.cat + " ORIGINAL:" + wdoc.word);
							cb(null, cats.concat(wdoc.cat));
						} 
						else cb(null, cats);
					});
				});
			}
		});
	});
}

function logUniqueWord(wordID, w, cats, cb) {

	//console.log('logUniqueWord:' + w);
	common.mongo.collection('unique_words'+common.db_suffix, function(err, collection) { 
		// upsert unique_words
		collection.findAndModify(
			{word: w}, 
			[['_id','asc']], 
			{$push: {wordInstanceIDs: wordID, sentenceInstanceIDs: curSentenceID}, $set: {categories: cats}},
			{upsert:true, new:true},
			function(err, object) {
				//console.log("object "+object);
				cb(null, object);
		});
	});
}

function logWordInstance(speaker, wordID, uniqueWDoc, time, cb) {
	//console.log('logWordInstance');
	// insert into word_instances with cats
	common.mongo.collection('word_instances'+common.db_suffix, function(err, collection) {
		// insert into word_instances
		var doc = {
			_id: wordID,
			word: uniqueWDoc.word,
			sentenceID: curSentenceID,
			speakerID: speaker,
			eventID: curEventID,
			categories: uniqueWDoc.categories,
			timeDiff: time
		}
		collection.insert(doc);
		cb(null, uniqueWDoc);
	});
}

function logSentence(speaker, wordID, time, cb) {

	//console.log('logSentence');	
	common.mongo.collection('sentence_instances'+common.db_suffix, function(err, collection) {
		if (sentenceStartF) {
			curSentenceID = new common.mongo.bson_serializer.ObjectID();

			var doc = {
				_id: curSentenceID,
				wordInstanceIDs: [wordID],
				speakerID: speaker,
				eventID: curEventID,
				timeDiff: time
			}

			collection.insert(doc);
		} 
		// else add curWordID to wordInstanceIDs
		else {
			collection.update({_id: curSentenceID}, {$push: {wordInstanceIDs: wordID}});
		}

		cb(null);
	});
}

function processNGrams(l, t, speaker, wID, sID, uniqueWDoc, ngrams, cb) {

	//console.log('processNGrams');
	
	//FIXME: Eventually add and check ngram logic
	cb(null, uniqueWDoc, []);

	/*
	var curGram;
	if (l == 2) curGram = cur2Gram;
	else if (l == 3) curGram = cur3Gram;
	else if (l == 4) curGram = cur4Gram;

	// check for 2grams
	if (curGram.length == l) {
		curGram.shift();
		curGram.push(uniqueWDoc.word);
		common.mongo.collection('unique_'+l+'grams'+common.db_suffix, function(e, c) {
			c.findAndModify(
				{ngram: curGram},
				[['_id','asc']], 
				{$push: {wordInstanceIDs: wID, sentenceInstanceIDs: sID}}, 
				{upsert:true, new:true},
				function(err, object) {
					if(object.wordInstanceIDs.length == minNGramOccurrences) {
						sendNewNGram(t, object._id, curGram, object.wordInstanceIDs);
					}
					if(object.wordInstanceIDs.length >= minNGramOccurrences) {
						ngrams.push([object._id, object.wordInstanceIDs.length]);
					}
					cb(null, uniqueWDoc, ngrams);
				}
			);
		});
	} else {
		curGram.push(uniqueWDoc.word);
		cb(null, uniqueWDoc, ngrams);
	}
	*/
}


function sendNewNGram(t, nid, n, nInstances) {
	var message = {
		type: "newNGram",
		timeDiff: t,
		dbid: nid,
		ngram: n, 
		instances: nInstances
	};
  common.sendMessage(message, true);
}

function sendWord(cb, t, s, uniqueWDoc, w, punctuationF, ngramsArr)
{
	//console.log("send word: "+w+" "+punctuationF);
	var message = {
		type: "word",
		timeDiff: t,
		dbid: uniqueWDoc._id,
		word: w,
		speaker: s,
		punctuationFlag: punctuationF 
	};

	//console.log("Flag: "+punctuationF);
	if (!punctuationF) {
		message['sentenceStartFlag'] = sentenceStartF;
		message['cats'] = uniqueWDoc.categories;
		message['wordInstances'] = uniqueWDoc.wordInstanceIDs.length;
		message['ngrams'] = ngramsArr;
		sentenceStartF = false; //reset
	}

  common.sendMessage(message, true);
  cb(null, uniqueWDoc, ngramsArr);
}


function handleSentenceEnd(timeDiff, speaker, cb) {
		// analyze sentiment
  sentistrength(curSentenceBuffer, function(sentiment) {
		sendSentenceEnd(timeDiff, speaker, sentiment, curSentenceBuffer.split(" ").length-1);

		sentenceStartF = true;
		curSentenceBuffer = "";

		// reset ngrams at start of sentence
		cur2Gram = [];
		cur3Gram = [];
		cur4Gram = [];

		cb(null);
	});
}


function sendSentenceEnd(t, speaker, senti, l)
{
	var message = {
		type: "sentenceEnd",
		timeDiff: t,
		speaker: speaker,
		sentiment: senti,
		length: l
	};
	console.log("SENTENCE END!! "+message);
	common.sendMessage(message, true);
}

function sendEndMessage() {
	var message = {
		type: "transcriptDone",
		timeDiff: (new Date().getTime()) - common.startTime
	};
	common.sendMessage(message, true);
}


//TODO: load a text file and generate a RegExp (or a series of them) based on the file
function checkAbrev(token1)
{
	//console.log(token1 + ">>" + abrevRegExp.test(token1));

	if (abrevRegExp.test(token1))
	{	
		//console.log("Match: " + token1);
		return true;
	}
	else return false;
}



//JRO - fixed delimeters
function stripTCPDelimiter(text)
{		

	while (text.indexOf('\n\0') != -1)
	{
		text = text.replace('\n\0', '');
	}
	
	/*
	if (text.indexOf('\0') != -1) console.log("Null");
	if (text.indexOf('\r') != -1) console.log("Return");
	if (text.indexOf('\f') != -1) console.log("Feed");
	if (text.indexOf('\n') != -1) console.log("Line");
	*/
	
	return text;
	
}

//JRO - explict call to change speaker
function setSpeaker(id)
{
	//NOTE: not testing the id
	curSpeakerID = id;
}



//exposing this to for debugging and testing
//TODO: make private once tested
exports.parseWords = parseWords;
exports.stripTCPDelimiter = stripTCPDelimiter;
exports.handleChars = handleChars;
exports.sendEndMessage = sendEndMessage;
exports.setSpeaker = setSpeaker;