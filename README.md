# Hype Drag Controller


![Hype Drag Controller|690x487](https://playground.maxziebell.de/Hype/DragController/HypeDragController.jpg)


A self-contained, physics-agnostic drag-and-drop controller for Tumult Hype. Provides a clean, namespaced API with data-attribute-based target detection and callback support for creating interactive drag-and-drop experiences.

Content Delivery Network (CDN)
--

Latest version can be linked into your project using the following in the head section of your project:

```html
<script src="https://cdn.jsdelivr.net/gh/worldoptimizer/HypeDragController/HypeDragController.min.js"></script>
```
Optionally you can also link a SRI version or specific releases. 
Read more about that on the JsDelivr (CDN) page for this extension at https://www.jsdelivr.com/package/gh/worldoptimizer/HypeDragController

Learn how to use the latest extension version and how to combine extensions into one file at
https://github.com/worldoptimizer/HypeCookBook/wiki/Including-external-files-and-Hype-extensions

---

## Features

-   **Self-contained**: No external dependencies beyond Tumult Hype
-   **Data-attribute driven**: Uses `data-drag-name` and `data-drop-target` attributes for clean, reusable configuration
-   **Callback support**: `onStart`, `onProgress`, and `onDrop` callbacks for custom interaction logic
-   **Smart drop detection**: Automatically finds the drop target with the largest overlap area
-   **Element locking**: Lock/unlock draggable elements to control interaction states
-   **Snap animations**: Built-in snap-back and snap-to animations with customizable timing
-   **Multi-document support**: Works with multiple Hype documents on the same page

## Installation

1.  Download `HypeDragController.js` from this repository.
2.  Add the script to your Tumult Hype project's Resources folder.
3.  The controller will automatically initialize when your Hype document loads.

## Quick Start

### 1. Set up your Hype elements (in the Identity Inspector)

Add data attributes to your Hype elements under "Additional HTML Attributes":

**Drag element**
```html
data-drag-name="card1"
```

**Drop target**
```html
data-drop-target="slot1"
```

### 2. Configure the drag event

In Tumult Hype, select your draggable element and add an **On Drag** action in the Actions Inspector:
-   **Action**: Run JavaScript...
-   **Function**: New Function...
-   Name the function `dragHandler` and paste the following code:
```javascript
// element - The DOM element that triggered this function
// event - The event that triggered this function
function dragHandler(hypeDocument, element, event) {
  hypeDocument.drag.handler(element, event);
}
```
Apply this same `dragHandler` function to all your draggable elements.

### 3. Set up interaction logic

Add this to your scene's **On Scene Load** action:

```javascript
hypeDocument.drag.setInteractionMap({
    'card1': {
        onDrop: function(hypeDocument, element, event) {
            // The drop target element is now found inside the event object
            const dropTarget = event.dropTarget;

            if (dropTarget && dropTarget.dataset.dropTarget === 'slot1') {
                // Successful drop - snap to target
                hypeDocument.drag.snapTo(element, dropTarget);
            } else {
                // Failed drop - snap back to original position
                hypeDocument.drag.snapBack(element);
            }
        }
    }
});
```

## API Reference

### `hypeDocument.drag.handler(element, event)`
The main drag event handler. Assign this to your element's **On Drag** action.

### `hypeDocument.drag.setInteractionMap(map)`
Define interaction behaviors for your draggable elements. The `onDrop` callback now receives the `event` object as its third parameter, which contains the `dropTarget`.

```javascript
hypeDocument.drag.setInteractionMap({
    'dragName': {
        onStart: function(hypeDocument, element, event) { /* ... */ },
        onProgress: function(hypeDocument, element, event) { /* ... */ },
        onDrop: function(hypeDocument, element, event) {
            const dropTarget = event.dropTarget;
            /* ... */
        }
    }
});
```

### `hypeDocument.drag.snapBack(element)`
Animate an element back to its initial position using the default snap-back animation settings.

### `hypeDocument.drag.snapTo(element, destination)`
Snap an element to a destination element or a selector string.

```javascript
// Snap to an element object
hypeDocument.drag.snapTo(draggedElement, targetElement);

// Snap to a selector
hypeDocument.drag.snapTo(draggedElement, '[data-drop-target="slot1"]');
```

### `hypeDocument.drag.lock(element)` / `unlock(element)`
Disable or enable pointer events on an element, effectively preventing or allowing it to be dragged.

```javascript
hypeDocument.drag.lock(element);    // Disable dragging
hypeDocument.drag.unlock(element);  // Enable dragging
```

## Configuration

Customize default animation settings by calling this function once, for example in a global script or on first scene load.

```javascript
HypeDragController.setDefault({
    bringToFront: true,           // Bring dragged elements to front
    snapBackDuration: 0.4,        // Snap back animation duration
    snapBackTiming: 'easeinout',  // Snap back timing function
    snapToDuration: 0.3,          // Snap to target duration
    snapToTiming: 'easeout',      // Snap to target timing function
    resetOnSceneUnload: false     // Reset drag state on scene unload
});
```

## Data Attributes

| Attribute          | Required | Description                            |
| ------------------ | -------- | -------------------------------------- |
| `data-drag-name`   | Yes      | Unique identifier for draggable elements. |
| `data-drop-target` | No       | Identifies elements as drop targets.   |

## Scene-Specific Data (`gameState`)

The controller provides a simple `hypeDocument.customData.gameState` object. This is a convenient place to store data related to the **current scene's state**, such as a score or the number of matched items.

Please note that this `gameState` is **automatically cleared when the scene changes** (on `HypeSceneUnload`). This design is intentional for self-contained, single-scene interactions. For data that needs to persist across multiple scenes, you should manage your own global data structures.

## Complete Scene Example: Card Matching Game

This example shows how to set up a drag-and-drop game using **shared handler functions** for clean, reusable code. The goal is to match multiple cards to their correct slots and then trigger a "win" timeline.

**Hype Setup:**
*   Two draggable elements: `data-drag-name="cardA"` and `data-drag-name="cardB"`
*   Two drop targets: `data-drop-target="slotA"` and `data-drop-target="slotB"`
*   A Hype timeline named `WinTimeline`

### Step 1: Create the Drag Handler Function

In Hype, create a single JavaScript function named `dragHandler` and assign it to the **On Drag** action of *both* `cardA` and `cardB`.

```javascript
// Function: dragHandler
function dragHandler(hypeDocument, element, event) {
  hypeDocument.drag.handler(element, event);
}
```

### Step 2: Add the Scene Logic

Select the Scene and add this script to its **On Scene Load** action.

```javascript
// -- GAME SETUP --
hypeDocument.customData.gameState = {
    matched: 0,
    neededToWin: 2
};

function checkWinCondition(hypeDocument) {
    if (hypeDocument.customData.gameState.matched >= hypeDocument.customData.gameState.neededToWin) {
        hypeDocument.startTimelineNamed('WinTimeline', hypeDocument.kDirectionForward);
    }
}

// -- SHARED HANDLER FUNCTIONS --

// A shared function to apply visual feedback when a drag starts.
function handleDragStart(hypeDocument, element, event) {
    hypeDocument.setElementProperty(element, 'scaleX', 1.1, 0.2, 'easeout');
    hypeDocument.setElementProperty(element, 'scaleY', 1.1, 0.2, 'easeout');
}

// A shared function to handle all drop logic.
// 'this' refers to the interaction map object for the element being dropped.
function handleCardDrop(hypeDocument, element, event) {
    // First, reset the visual feedback from onStart.
    hypeDocument.setElementProperty(element, 'scaleX', 1.0, 0.3, 'easein');
    hypeDocument.setElementProperty(element, 'scaleY', 1.0, 0.3, 'easein');
    
    const dropTarget = event.dropTarget;
    // 'this.correctTarget' is a custom property we define in the map below.
    if (dropTarget && dropTarget.dataset.dropTarget === this.correctTarget) {
        // SUCCESS
        hypeDocument.drag.snapTo(element, dropTarget);
        hypeDocument.drag.lock(element);
        hypeDocument.customData.gameState.matched++;
        checkWinCondition(hypeDocument);
    } else {
        // FAIL
        hypeDocument.drag.snapBack(element);
    }
}

// -- INTERACTION MAP --
// Assign the shared handlers to multiple elements.
hypeDocument.drag.setInteractionMap({
    'cardA': {
        correctTarget: 'slotA', // Custom property for this card's logic
        onStart: handleDragStart,
        onDrop: handleCardDrop
    },
    'cardB': {
        correctTarget: 'slotB', // Custom property for this card's logic
        onStart: handleDragStart,
        onDrop: handleCardDrop
    }
});
```

## Advanced Technique: Snapping to an Alternate Position

Sometimes you want the drop area to be larger than the element's final resting place. This technique uses an invisible element as a precise snap point within a larger drop zone.

**Hype Setup:**
*   A draggable element: `data-drag-name="card1"`
*   A large, visible drop target: `data-drop-target="holder1"`
*   A small, invisible element to mark the final position. Give it a **Class Name** of `holder1-snap` in the Identity Inspector.

**On Scene Load Script:**

We add a custom `snapToSelector` property to our interaction map to tell the `onDrop` function where to snap the element.

```javascript
hypeDocument.drag.setInteractionMap({
    
    'card1': {
        correctTarget: 'holder1',
        snapToSelector: '.holder1-snap', // Use the class name as a CSS selector
        
        onDrop: function(hypeDocument, draggedElement, event) {
            const targetElement = event.dropTarget;

            // Check if it was dropped on the correct target area
            if (targetElement && targetElement.dataset.dropTarget === this.correctTarget) {
                
                // Snap to our custom selector instead of the drop target itself
                hypeDocument.drag.snapTo(draggedElement, this.snapToSelector);
                hypeDocument.drag.lock(draggedElement);
                
            } else {
                hypeDocument.drag.snapBack(draggedElement); 
            }
        }
    }
});
```

## License

MIT License - see the LICENSE file for details.
<br>Made with ❤️ for the Tumult Hype community.
