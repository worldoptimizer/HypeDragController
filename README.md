# Hype Drag Controller

A self-contained, physics-agnostic drag-and-drop controller for Tumult Hype. Provides a clean, namespaced API with data-attribute-based target detection and callback support for creating interactive drag-and-drop experiences.

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
        onDrop: function(hypeDocument, element, dropTarget) {
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
Define interaction behaviors for your draggable elements. This is typically set on scene load.

```javascript
hypeDocument.drag.setInteractionMap({
    'dragName': {
        onStart: function(hypeDocument, element, event) { /* ... */ },
        onProgress: function(hypeDocument, element, event) { /* ... */ },
        onDrop: function(hypeDocument, element, dropTarget) { /* ... */ }
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
    snapToTiming: 'easeout'       // Snap to target timing function
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

This example shows how to set up a complete drag-and-drop interaction for a single scene. The goal is to match two cards to their correct slots and then trigger a "win" timeline.

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
// This gameState object is automatically cleared when leaving the scene.
hypeDocument.customData.gameState = {
    matched: 0,
    neededToWin: 2
};

// A reusable function to check if the win condition is met.
function checkWinCondition(hypeDocument) {
    if (hypeDocument.customData.gameState.matched >= hypeDocument.customData.gameState.neededToWin) {
        hypeDocument.startTimelineNamed('WinTimeline', hypeDocument.kDirectionForward);
    }
}

// -- INTERACTION MAP --
// Define all drag-and-drop behaviors for this scene.
hypeDocument.drag.setInteractionMap({
    
    'cardA': {
        correctTarget: 'slotA', // Custom property to define the correct drop target
        onDrop: handleDrop
    },
    
    'cardB': {
        correctTarget: 'slotB', // Custom property
        onStart: function(hypeDocument, element, event) {
            // Add visual feedback when dragging starts
            hypeDocument.setElementProperty(element, 'rotateZ', 5, 0.2, 'easeout');
        },
        onDrop: function(hypeDocument, element, dropTarget) {
            // Reset visual feedback
            hypeDocument.setElementProperty(element, 'rotateZ', 0, 0.3, 'easein');
            
            // Call the shared drop handler
            handleDrop.call(this, hypeDocument, element, dropTarget);
        }
    }
});


// -- SHARED DROP HANDLER --
// A single function to handle the drop logic for any card.
// 'this' refers to the interaction map object ('cardA' or 'cardB').
function handleDrop(hypeDocument, element, dropTarget) {
    if (dropTarget && dropTarget.dataset.dropTarget === this.correctTarget) {
        // SUCCESS: Dropped on the correct target
        hypeDocument.drag.snapTo(element, dropTarget);
        hypeDocument.drag.lock(element); // Lock the element in place
        hypeDocument.customData.gameState.matched++;
        checkWinCondition(hypeDocument);
        
    } else {
        // FAIL: Dropped on an incorrect target or nowhere
        hypeDocument.drag.snapBack(element);
    }
}
```

## Advanced Technique: Snapping to an Alternate Position

Sometimes you want the drop area to be larger or different from the element's final resting place. For example, you might have a large, visible drop zone but want the card to snap neatly to a small, invisible point within that zone.

**Hype Setup:**
*   A draggable element: `data-drag-name="card1"`
*   A large, visible drop target: `data-drop-target="holder1"`
*   A small, invisible element to mark the final position. Give it a **Class Name** of `holder1-snap` in the Identity Inspector.

**On Scene Load Script:**

By adding a custom `snapToSelector` property to our interaction map, we can tell the `onDrop` function where to snap the element.

```javascript
hypeDocument.drag.setInteractionMap({
    
    'card1': {
        correctTarget: 'holder1',
        snapToSelector: '.holder1-snap', // Use the class name as a CSS selector
        
        onDrop: function(hypeDocument, draggedElement, targetElement) {
            // Check if it was dropped on the correct target area
            if (targetElement && targetElement.dataset.dropTarget === this.correctTarget) {
                
                // Snap to our custom selector instead of the drop target itself
                hypeDocument.drag.snapTo(draggedElement, this.snapToSelector);
                hypeDocument.drag.lock(draggedElement);
                
                // You could add scoring logic here...
                
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
