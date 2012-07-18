//These variables need to remain global so that we can add to the buffers periodically
var curWordBuffer = "";
var curSentenceBuffer = "";

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
		}
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundWords];
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
			}		
			
		}	
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundSentences];
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