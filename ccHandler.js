
var common = require('./common.js');
// Include the stanford named-entity recognition
var namedentity = require(__dirname + "/named-entity");

//These variables need to remain global so that we can add to the buffers periodically
var curWordBuffer = "";
var curSentenceBuffer = "";
var curSpeakerID = 0; //0 - moderator, 1 - obama, 2 - romney
var curEventID = 0;
var sentenceStartF = true;

//MongoDB stuff
var curSentenceID = 0;

//Regular Expressions
var wordRegExp = new RegExp(/[\s \! \? \; \( \) \[ \] \{ \} \< \> "]|,(?=\W)|[\.\-\&](?=\W)|:(?!\d)/g);
var sentenceRegExp = new RegExp(/[\.|\?|\!]\s/g);
var abrevRegExp = new RegExp(/(Mr|Mrs|Ms|Dr|Sr|U\.S|D\.C)$/i);

//Called from outside of 
function handleChars(newChars)
{
	//console.log(newChars);
	//process.stdout.write(newChars);

	//1. add chars to current word
	curWordBuffer += newChars;
	
	//2. find the words in the buffer
	curWordBuffer = parseWords(curWordBuffer)[0];
	//console.log(curBuffer);
	
	//3. add chars to current sentence
	curSentenceBuffer += newChars;
	
	//4. find sentences
	curSentenceBuffer = parseSentence(curSentenceBuffer)[0];

}

//Function takes a buffer and pulls out any words
function parseWords(text)
{
	//return elements
	var foundWords = [];
	var returnBuf = "";
	
	//PEND: maybe it just has the *** on occasion?
	text = text.replace("***", '');
	
	//split input string with RegExo
	var tokens = text.split(wordRegExp);
	
	for (i in tokens)
	{
		//If the element isn't the last in an array, it is a new word
		if ((i<tokens.length - 1) && tokens[i] !== "")
		{
			foundWords.push(tokens[i]);
			console.log("Word: " + tokens[i]);
			if (tokens[i] == "MODERATOR" || tokens[i] == "QUESTION" || tokens[i] == "BROKAW" || tokens[i] == "IFILL") curSpeakerID = 0;
			else if (tokens[i] == "OBAMA" || tokens[i] == "BIDEN") curSpeakerID = 1;
			else if (tokens[i] == "MCCAIN" || tokens[i] == "ROMNEY" || tokens[i] == "PALIN") curSpeakerID = 2;
			else { //only broadcast if not speaker name
				namedentity(tokens[i], sentenceStartF, function(resp) {
					handleWord(resp, false, false, 0); //PEND updates these args to be correct
				});
			}
		}
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundWords];
}

function handleWord(w, punctuationF, ngram, ngramInst)
{	
	var curWordID = new common.mongo.bson_serializer.ObjectID(); 
	var curTime = new Date().getTime();

	common.mongo.collection('sentence_instances', function(err, collection) {
		// if new sentence, generate ID and insert into sentence_instances
		if (curSentenceID === 0) {
			curSentenceID = new common.mongo.bson_serializer.ObjectID();
			
			var doc = {
				_id: curSentenceID,
				wordInstanceIDs: [curWordID],
				speakerID: curSpeakerID,
				eventID: curEventID,
				timestamp: curTime
			}
			
			collection.insert(doc);
		} 
		// else add curWordID to wordInstanceIDs
		else {
			collection.update({_id: curSentenceID}, {$push: {wordInstanceIDs: curWordID}});
		}
	});
	
	
	common.mongo.collection('word_instances', function(err, collection) {
		// insert into word_instances
		var doc = {
			_id: curWordID,
			word: w,
			sentenceID: curSentenceID,
			speakerID: curSpeakerID,
			eventID: curEventID,
			timestamp: curTime
		}
		collection.insert(doc);
		
		console.log("w:"+w);
		
		//updateFreq(collection, word);
	});
	
	
	common.mongo.collection('unique_words', function(err, collection) { 
		// upsert unique_words
		//collection.update({word: w}, {$push: {wordInstanceIDs: curWordID, sentenceInstanceIDs: curSentenceID}}, {upsert:true});
		collection.findAndModify(
			{word: w}, 
			[['_id','asc']], 
			{$push: {wordInstanceIDs: curWordID, sentenceInstanceIDs: curSentenceID}}, 
			{upsert:true, new:true},
			function(err, object) {
			
				common.mongo.collection('LIWC', function(e, c) {
					// first check if it's in LIWC (non wildcard)
					c.findOne({'word':w.toLowerCase()}, function(err, doc) {
						var cats = [];
						if (doc) {
							collection.update({word: w}, {$set: {categories: doc.cat}}, {upsert:true});	
							console.log("NORMAL "+w+" "+doc.cat);
							cats = doc.cat;			
						} 
						else { // if not found, check wildcards
							common.mongo.collection('LIWC_wildcards', function(e, c) {
								c.findOne({$where: "'"+w.toLowerCase()+"'.indexOf(this.word) != -1" }, function(err, wdoc) {
									if (wdoc) {
										console.log("WILDCARD " + w);
										collection.update({word: w}, {$set: {categories: wdoc.cat}}, {upsert:true});	
										cats = wdoc.cat;
									}
								});
							});
						}	
						sendWord(w, cats, punctuationF, object.wordInstanceIDs.length, ngram, ngramInst);	
					});
				});
			});
	});
}

function sendWord(w, wcats, punctuationF, numInstances, ngram, ngramInst)
{
	var message = {
		type: "word",
		word: w,
		speaker: curSpeakerID,
		cats: wcats,
		sentenceStartFlag: sentenceStartF,
		punctuationFlag: punctuationF,
		wordInstances: numInstances,
		ngramID: ngram,
		ngramInstances: ngramInst
	};

  Object.keys(common.engine.clients).forEach(function(key) {
    common.engine.clients[key].send(JSON.stringify(message));
    console.log(message);
  });
	
	sentenceStartF = false; //reset
}


//Function takes a buffer and pulls out any sentences

function parseSentence(text)
{
	//return elements
	var foundSentences = [];
	var returnBuf = "";
	
	//maybe it just has the *** on occasion?
	text = text.replace("***", '');
	
	//split input string with RegExo
	var tokens = text.split(sentenceRegExp);
	
	
	for (i=0; i<tokens.length; i++)
	{
		//if (tokens.length > 1) console.log("  Token:"+i+":"+tokens[i]+"<<");
	
		//If the element isn't the last in an array, it is a new word
		if ((i<tokens.length - 1) && tokens[i] !== "")
		{
			//if the sentence ends with an abbrev, it is a false positive
			//concat the current token and the next token
			if (checkAbrev(tokens[i])) 
			{
				var next = tokens[i]+". "+tokens[i+1];
				//console.log("  Next:"+next);
				
				tokens[i+1] = next;
			}
			else 
			{		
				//need to find the punctuation in the original word
				var index = text.lastIndexOf(tokens[i]) + tokens[i].length;
				var punct = text.slice(index, index+1)
				//console.log("Index: "+ index + " >> Punctuation: "+ punct);
			
				tokens[i] += punct;
			
				foundSentences.push(tokens[i]);
				console.log("Sentence: " + tokens[i]);
				sendSentence(tokens[i]);
				sentenceStartF = true;
			}		
			
		}	
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundSentences];
}

function sendSentence(s)
{
	var message = {
		type: "sentenceEnd",
		speaker: curSpeakerID
	};

  Object.keys(common.engine.clients).forEach(function(key) {
    common.engine.clients[key].send(JSON.stringify(message));
  });
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



//TODO: This is still failing to delinit
function stripTCPDelimiter(text)
{		
	//var re = '/\*{3}./';
	//text = text.replace(re, '');

	text = text.replace("***\0", '');
	//PEND: fix this
	//for some reason, it's missing the replace every once in a while, but doing it twice helps 
	text = text.replace("***\0", '');

	return text;
}



//exposing this to for debugging and testing
//TODO: make private once tested
exports.parseWords = parseWords;
exports.stripTCPDelimiter = stripTCPDelimiter;
exports.handleChars = handleChars;
