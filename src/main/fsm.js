var greekLetterNames = [ 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega' ];

function convertLatexShortcuts(text) {
	// html greek characters
	for(var i = 0; i < greekLetterNames.length; i++) {
		var name = greekLetterNames[i];
		text = text.replace(new RegExp('\\\\' + name, 'g'), String.fromCharCode(913 + i + (i > 16)));
		text = text.replace(new RegExp('\\\\' + name.toLowerCase(), 'g'), String.fromCharCode(945 + i + (i > 16)));
	}

	// subscripts
	for(var i = 0; i < 10; i++) {
		text = text.replace(new RegExp('_' + i, 'g'), String.fromCharCode(8320 + i));
	}

	return text;
}

function textToXML(text) {
	text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	var result = '';
	for(var i = 0; i < text.length; i++) {
		var c = text.charCodeAt(i);
		if(c >= 0x20 && c <= 0x7E) {
			result += text[i];
		} else {
			result += '&#' + c + ';';
		}
	}
	return result;
}

function drawArrow(c, x, y, angle) {
	var dx = Math.cos(angle);
	var dy = Math.sin(angle);
	c.beginPath();
	c.moveTo(x, y);
	c.lineTo(x - 8 * dx + 5 * dy, y - 8 * dy - 5 * dx);
	c.lineTo(x - 8 * dx - 5 * dy, y - 8 * dy + 5 * dx);
	c.fill();
}

function canvasHasFocus() {
	return (document.activeElement || document.body) == document.body;
}

function drawText(c, text, x, y, angleOrNull, isSelected) {
	c.font = '20px "Times New Roman", serif';
	var width = c.measureText(text).width;

	// center the text
	x -= width / 2;

	// position the text intelligently if given an angle
	if(angleOrNull != null) {
		var cos = Math.cos(angleOrNull);
		var sin = Math.sin(angleOrNull);
		var cornerPointX = (width / 2 + 5) * (cos > 0 ? 1 : -1);
		var cornerPointY = (10 + 5) * (sin > 0 ? 1 : -1);
		var slide = sin * Math.pow(Math.abs(sin), 40) * cornerPointX - cos * Math.pow(Math.abs(cos), 10) * cornerPointY;
		x += cornerPointX - sin * slide;
		y += cornerPointY + cos * slide;
	}

	// draw text and caret (round the coordinates so the caret falls on a pixel)
	x = Math.round(x);
	y = Math.round(y);
	c.fillText(text, x, y + 6);
	if(isSelected && caretVisible && canvasHasFocus() && document.hasFocus()) {
		var textBeforeCaretWidth = c.measureText(text.substring(0, caretIndex)).width;
		x += textBeforeCaretWidth;
		c.beginPath();
		c.moveTo(x, y - 10);
		c.lineTo(x, y + 10);
		c.stroke();
	}
}

var caretTimer;
var caretVisible = true;
var caretIndex = 0;

function resetCaret() {
	clearInterval(caretTimer);
	caretTimer = setInterval('caretVisible = !caretVisible; draw()', 500);
	caretVisible = true;
}

var canvas;
var canvasWidthInput;
var canvasHeightInput;
var nodeRadius = 30;
var nodes = [];
var links = [];
var states = [];
var statesIndex = -1;

var snapToPadding = 6; // pixels
var hitTargetPadding = 6; // pixels
var selectedObject = null; // either a Link or a Node
var currentLink = null; // a Link
var movingObject = false;
var movingAllObjects = false;
var originalClick;

function drawUsing(c) {
	c.beginPath();
	c.fillStyle = "white";
	c.rect(0, 0, canvas.width, canvas.height);
	c.fill();
	c.save();
	c.translate(0.5, 0.5);

	for(var i = 0; i < nodes.length; i++) {
		c.lineWidth = 1;
		c.fillStyle = c.strokeStyle = (nodes[i] == selectedObject) ? 'blue' : 'black';
		nodes[i].draw(c);
	}
	for(var i = 0; i < links.length; i++) {
		c.lineWidth = 1;
		c.fillStyle = c.strokeStyle = (links[i] == selectedObject) ? 'blue' : 'black';
		links[i].draw(c);
	}
	if(currentLink != null) {
		c.lineWidth = 1;
		c.fillStyle = c.strokeStyle = 'black';
		currentLink.draw(c);
	}

	c.restore();
}

function draw() {
	drawUsing(canvas.getContext('2d'));
}

function selectObject(x, y) {
	for(var i = 0; i < nodes.length; i++) {
		if(nodes[i].containsPoint(x, y)) {
			return nodes[i];
		}
	}
	for(var i = 0; i < links.length; i++) {
		if(links[i].containsPoint(x, y)) {
			return links[i];
		}
	}
	return null;
}

function snapNode(node) {
	for(var i = 0; i < nodes.length; i++) {
		if(nodes[i] == node) continue;

		if(Math.abs(node.x - nodes[i].x) < snapToPadding) {
			node.x = nodes[i].x;
		}

		if(Math.abs(node.y - nodes[i].y) < snapToPadding) {
			node.y = nodes[i].y;
		}
	}
}

window.onload = function() {
	canvas = document.getElementById('canvas');
	canvasWidthInput = document.getElementById("canvasWidth");
	canvasHeightInput = document.getElementById("canvasHeight");

	canvasWidthInput.value = canvas.width;
	canvasHeightInput.value = canvas.height;

	updateStates();
	draw();

	document.querySelectorAll(".canvasSizeInput").forEach(function(elem) {
		elem.addEventListener("keypress", function(e) {
			if(e.key === "Enter") {
				setCanvasSize();
			}
		});
	});

	canvas.onmousedown = function(e) {
		var mouse = crossBrowserRelativeMousePos(e);
		selectedObject = selectObject(mouse.x, mouse.y);
		movingObject = false;
		originalClick = mouse;

		if(selectedObject != null) {
			if(shift && selectedObject instanceof Node) {
				currentLink = new SelfLink(selectedObject, mouse);
			} else {
				movingObject = true;
				deltaMouseX = deltaMouseY = 0;
				if(selectedObject.setMouseStart) {
					selectedObject.setMouseStart(mouse.x, mouse.y);
				}
			}

			caretIndex = selectedObject.text.length;
			resetCaret();
		} else if(shift) {
			currentLink = new TemporaryLink(mouse, mouse);
		} else {
			movingAllObjects = true;
			canvas.style.cursor = "all-scroll";
		}

		draw();

		if(canvasHasFocus()) {
			// disable drag-and-drop only if the canvas is already focused
			return false;
		} else {
			// otherwise, let the browser switch the focus away from wherever it was
			resetCaret();
			return true;
		}
	};

	canvas.ondblclick = function(e) {
		var mouse = crossBrowserRelativeMousePos(e);
		selectedObject = selectObject(mouse.x, mouse.y);

		if(selectedObject == null) {
			selectedObject = new Node(mouse.x, mouse.y);
			nodes.push(selectedObject);
			resetCaret();
			draw();
		} else if(selectedObject instanceof Node) {
			selectedObject.isAcceptState = !selectedObject.isAcceptState;
			draw();
		}

		caretIndex = selectedObject.text.length;
		updateStates();
	};

	var prevMouse = null;
	var mouse = null;

	canvas.onmousemove = function(e) {
		prevMouse = mouse;
		mouse = crossBrowserRelativeMousePos(e);

		if(currentLink != null) {
			var targetNode = selectObject(mouse.x, mouse.y);
			if(!(targetNode instanceof Node)) {
				targetNode = null;
			}

			if(selectedObject == null) {
				if(targetNode != null) {
					currentLink = new StartLink(targetNode, originalClick);
				} else {
					currentLink = new TemporaryLink(originalClick, mouse);
				}
			} else {
				if(targetNode == selectedObject) {
					currentLink = new SelfLink(selectedObject, mouse);
				} else if(targetNode != null) {
					currentLink = new Link(selectedObject, targetNode);
				} else {
					currentLink = new TemporaryLink(selectedObject.closestPointOnCircle(mouse.x, mouse.y), mouse);
				}
			}
			draw();
		}

		else if(movingObject) {
			selectedObject.setAnchorPoint(mouse.x, mouse.y);
			if(selectedObject instanceof Node) {
				snapNode(selectedObject);
			}
			draw();
		}

		else if(movingAllObjects) {
			for(var i = 0; i < nodes.length; i++) {
				nodes[i].x += mouse.x - prevMouse.x;
				nodes[i].y += mouse.y - prevMouse.y;
			}
			
			draw();
		}
	};

	canvas.onmouseup = function(e) {
		canvas.style.cursor = "default";
		movingObject = false;
		movingAllObjects = false;

		if(currentLink != null) {
			if(!(currentLink instanceof TemporaryLink)) {
				selectedObject = currentLink;
				links.push(currentLink);
				caretIndex = 0;
				resetCaret();
			}
			currentLink = null;
			draw();
		}

		updateStates();
	};
}

var shift = false;

document.onkeydown = function(e) {
	var key = crossBrowserKey(e);

	if(key == 16) {
		shift = true;
	} else if(!canvasHasFocus()) {
		// don't read keystrokes when other things have focus
		return true;
	} else if(key == 8) { // backspace key
		if(selectedObject != null && 'text' in selectedObject) {
			// Remove the character before the caret
			var textBeforeCaret = selectedObject.text.substring(0, caretIndex - 1);
			
			// Get the text afte the caret
			var textAfterCaret = selectedObject.text.substring(caretIndex);
			
			// Set the selected objects text to the concatnation of the text before and after the caret
			selectedObject.text = textBeforeCaret + textAfterCaret;

			// Decrement the caret index and reset the caret
			if(--caretIndex < 0)
				caretIndex = 0;

			resetCaret();
			draw();
		}

		// backspace is a shortcut for the back button, but do NOT want to change pages
		return false;
	} else if(key == 46) { // delete key
		if(selectedObject != null) {
			for(var i = 0; i < nodes.length; i++) {
				if(nodes[i] == selectedObject) {
					nodes.splice(i--, 1);
				}
			}
			for(var i = 0; i < links.length; i++) {
				if(links[i] == selectedObject || links[i].node == selectedObject || links[i].nodeA == selectedObject || links[i].nodeB == selectedObject) {
					links.splice(i--, 1);
				}
			}
			selectedObject = null;
			draw();
		}
	}
};

document.onkeyup = function(e) {
	var key = crossBrowserKey(e);

	if(key === 16) {
		shift = false;
	}

	// Left arrow key
	if(key === 37){
		if(selectedObject && selectedObject.text){
			if(--caretIndex < 0)
				caretIndex = 0;

			resetCaret();
			draw();
		}
	}

	// Right arrow key
	if(key === 39){
		if(selectedObject && selectedObject.text){
			if(++caretIndex > selectedObject.text.length)
				caretIndex = selectedObject.text.length;

			resetCaret();
			draw();
		}
	}

	if(e.ctrlKey) {
		if(key == 90) // ctrl z
			getPreviousState();
		else if(key == 89) // ctrl y
			getNextState();
	}

	updateStates();
};

document.onkeypress = function(e) {
	// don't read keystrokes when other things have focus
	var key = crossBrowserKey(e);
	if(!canvasHasFocus()) {
		// don't read keystrokes when other things have focus
		return true;
	} else if(key >= 0x20 && key <= 0x7E && !e.metaKey && !e.altKey && !e.ctrlKey && selectedObject != null && 'text' in selectedObject) {
		// Add the letter at the caret
		var newText = selectedObject.text.substring(0, caretIndex) + String.fromCharCode(key) + selectedObject.text.substring(caretIndex);
		caretIndex++;

		// Parse for Latex short cuts and update the caret index appropriately 
		var formattedText = convertLatexShortcuts(newText);
		caretIndex -= newText.length - formattedText.length;

		// Update the selected objects text
		selectedObject.text = formattedText;

		// Draw the new text
		resetCaret();
		draw();
		
		// don't let keys do their actions (like space scrolls down the page)
		return false;
	} else if(key == 8) {
		// backspace is a shortcut for the back button, but do NOT want to change pages
		return false;
	}
};

function crossBrowserKey(e) {
	e = e || window.event;
	return e.which || e.keyCode;
}

function crossBrowserElementPos(e) {
	e = e || window.event;
	var obj = e.target || e.srcElement;
	var x = 0, y = 0;
	while(obj.offsetParent) {
		x += obj.offsetLeft;
		y += obj.offsetTop;
		obj = obj.offsetParent;
	}
	return { 'x': x, 'y': y };
}

function crossBrowserMousePos(e) {
	e = e || window.event;
	return {
		'x': e.pageX || e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
		'y': e.pageY || e.clientY + document.body.scrollTop + document.documentElement.scrollTop,
	};
}

function crossBrowserRelativeMousePos(e) {
	var element = crossBrowserElementPos(e);
	var mouse = crossBrowserMousePos(e);
	return {
		'x': mouse.x - element.x,
		'y': mouse.y - element.y
	};
}

function output(text) {
	var element = document.getElementById('output');
	element.style.display = 'block';
	element.value = text;
}

function saveAsPNG() {
	var oldSelectedObject = selectedObject;
	selectedObject = null;
	drawUsing(canvas.getContext('2d'));
	selectedObject = oldSelectedObject;
	var pngData = canvas.toDataURL('image/png');
	var pngLink = document.getElementById("pngLink");
	pngLink.download = "image.png";
	pngLink.href = pngData.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
}

function saveAsSVG() {
	var exporter = new ExportAsSVG();
	var oldSelectedObject = selectedObject;
	selectedObject = null;
	drawUsing(exporter);
	selectedObject = oldSelectedObject;
	var svgData = exporter.toSVG();
	output(svgData);
	// Chrome isn't ready for this yet, the 'Save As' menu item is disabled
	// document.location.href = 'data:image/svg+xml;base64,' + btoa(svgData);
}

function saveAsLaTeX() {
	var exporter = new ExportAsLaTeX();
	var oldSelectedObject = selectedObject;
	selectedObject = null;
	drawUsing(exporter);
	selectedObject = oldSelectedObject;
	var texData = exporter.toLaTeX();
	output(texData);
}

function saveAsJson() {
	var jsonLink = document.getElementById("jsonLink");
	jsonLink.download = "exportedToJson.json";
	jsonLink.href = 'data:application/json;charset=utf-8,'+ encodeURIComponent(exportJson());
}

function importJsonFile() {
	document.getElementById("importFileInput").click();
}

function importFileChange(e) {
	var file = e.target.files[0]
	var fileReader = new FileReader();

	fileReader.onload = function(fileLoadedEvent) {
		importJson(fileLoadedEvent.target.result);
		draw();
		updateStates();
		e.target.value = "";
	}

	fileReader.readAsText(file, "UTF-8");
}

function setCanvasSize() {
	if(canvas.width !== canvasWidthInput.value) {
		var diff = (canvasWidthInput.value - canvas.width) / 2;

		for(var i = 0; i < nodes.length; i++)
			nodes[i].x += diff;
	}
	
	canvas.width = canvasWidthInput.value;
	canvas.height = canvasHeightInput.value;
	draw();
	updateStates();
}

function updateStates() {
	var newState = exportJson();

	if(newState !== states[statesIndex]) {
		statesIndex++;
		states.length = statesIndex;
		states.push(exportJson());
	}
}

function getPreviousState() {
	statesIndex--;

	if(statesIndex < 0) {
		statesIndex = 0;
		return;
	}

	state = states[statesIndex];
	importJson(state);
	draw();
}

function getNextState() {
	statesIndex++;
	
	if(statesIndex >= states.length) {
		statesIndex = states.length - 1;
		return;
	}

	state = states[statesIndex];
	importJson(state);
	draw();
}
