/*!
 * Hype Drag Controller v1.4.0
 * Copyright (2024) Max Ziebell, MIT License
 */

/*
 * Version History
 * 1.0.0   Initial release.
 * 1.0.1   Refactored to use data-attributes (data-drag-name, data-drop-target) 
 *          instead of IDs and classes for improved reusability.
 * 1.0.2   Improved code readability by expanding setDefault/getDefault and 
 *          removing the _styleInjected flag in favor of a direct DOM check.
 * 1.0.3   Added comprehensive JSDoc comments to all functions for better maintainability.
 * 1.1.0   Corrected Hype API timing function names (e.g., 'easeinout' instead of 'ease-in-out').
 * 1.1.1   Enhanced drop target detection to select target with largest overlap area instead of first match.
 * 1.2.0   Added onProgress callback support during drag move phase for real-time interaction feedback.
 * 1.2.1   Added onStart callback support for drag initiation phase.
 * 1.2.2   Refactored to use a unified callback signature for onDrop.
 * 1.3.0   Added resetState API to clear all drag-related states for a scene.
 * 1.3.1   Added resetOnSceneUnload defaults to false and removed visual styling clearing.
 * 1.4.0   Added comprehensive drag constraint system with boundary, axis, and containment restrictions.
 *          Enhanced to accept drag names, automatic data-attribute constraint loading, and array support for batch operations.
 */

if ("HypeDragController" in window === false) window['HypeDragController'] = (function() {
    const _version = "1.4.0";

    let _default = {
        bringToFront: true,
        snapBackDuration: 0.4,
        snapBackTiming: 'easeinout',
        snapToDuration: 0.3,
        snapToTiming: 'easeout',
        resetOnSceneUnload: false
    };

    /**
     * Sets default options for the drag controller.
     * @param {string|object} key - The option key to set, or an object of key-value pairs.
     * @param {*} [value] - The value to set if the key is a string.
     */
    function setDefault(key, value) {
        if (typeof key === 'object') {
            _default = Object.assign(_default, key);
        } else {
            _default[key] = value;
        }
    }

    /**
     * Gets a default option value.
     * @param {string} [key] - The option key to retrieve. If omitted, returns all defaults.
     * @returns {*} The value of the option, or the entire defaults object.
     */
    function getDefault(key) {
        if (key) {
            return _default[key];
        }
        return _default;
    }
    
    /**
     * Injects the necessary CSS for the drag controller into the document head.
     * Prevents injection if the style element already exists.
     * @private
     */
    function _injectStyle() {
        if (document.getElementById('HypeDragControllerStyles')) return;
        const style = document.createElement('style');
        style.id = 'HypeDragControllerStyles';
        style.innerHTML = '.hypeDragElementLocked, .hypeDragElementLocked * { pointer-events: none !important; }';
        document.head.appendChild(style);
    }

    const _documents = {};
    /**
     * Retrieves or creates a data registry for a specific Hype document instance.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @returns {object} The registry object for the document.
     */
    function _getDocRegistry(hypeDocument) {
        const docId = hypeDocument.documentId();
        if (!_documents[docId]) {
            _documents[docId] = { dragData: {}, interactionMap: {}, constraints: {} };
        }
        return _documents[docId];
    }

    /**
     * Finds the drop target element with the largest overlap area with the dragged element.
     * @private
     * @param {HTMLElement} element - The element being dragged.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @returns {HTMLElement|null} The drop target element with largest overlap or null if no target is found.
     */
    function _getDropTarget(element, hypeDocument) {
        const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
        const targetElements = sceneEl.querySelectorAll('[data-drop-target]');
        const dragLeft = hypeDocument.getElementProperty(element, 'left');
        const dragTop = hypeDocument.getElementProperty(element, 'top');
        const dragWidth = hypeDocument.getElementProperty(element, 'width');
        const dragHeight = hypeDocument.getElementProperty(element, 'height');

        let bestTarget = null;
        let maxOverlapArea = 0;

        for (let i = 0; i < targetElements.length; i++) {
            const targetEl = targetElements[i];
            if (targetEl === element) continue;
            
            const targetLeft = hypeDocument.getElementProperty(targetEl, 'left');
            const targetTop = hypeDocument.getElementProperty(targetEl, 'top');
            const targetWidth = hypeDocument.getElementProperty(targetEl, 'width');
            const targetHeight = hypeDocument.getElementProperty(targetEl, 'height');

            // Check if there's any intersection
            if (dragLeft < targetLeft + targetWidth &&
                dragLeft + dragWidth > targetLeft &&
                dragTop < targetTop + targetHeight &&
                dragTop + dragHeight > targetTop) {
                
                // Calculate overlap area
                const overlapLeft = Math.max(dragLeft, targetLeft);
                const overlapTop = Math.max(dragTop, targetTop);
                const overlapRight = Math.min(dragLeft + dragWidth, targetLeft + targetWidth);
                const overlapBottom = Math.min(dragTop + dragHeight, targetTop + targetHeight);
                const overlapWidth = Math.max(0, overlapRight - overlapLeft);
                const overlapHeight = Math.max(0, overlapBottom - overlapTop);
                const overlapArea = overlapWidth * overlapHeight;
                
                // Keep track of the target with the largest overlap
                if (overlapArea > maxOverlapArea) {
                    maxOverlapArea = overlapArea;
                    bestTarget = targetEl;
                }
            }
        }
        return bestTarget;
    }

    /**
     * Calculates the bounding rectangle for a containment element.
     * @private
     * @param {HTMLElement} element - The element being dragged.
     * @param {string} containment - CSS class selector or 'parent' for containment.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @returns {object|null} Object with minX, maxX, minY, maxY properties, or null if containment fails.
     */
    function _getContainmentBounds(element, containment, hypeDocument) {
        let container;

        // Handle parent containment - find closest Hype element
        if (containment === 'parent') {
            const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
            container = element.parentElement.closest('.HYPE_element') || sceneEl;
        }
        // Handle CSS class selector containment
        else if (typeof containment === 'string') {
            const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
            container = sceneEl.querySelector(containment);
            if (!container) {
                console.warn('HypeDragController: Containment selector "' + containment + '" not found.', element);
                return null;
            }
        } else {
            console.warn('HypeDragController: Invalid containment specification. Must be a CSS class selector or "parent".', element);
            return null;
        }

        const containerWidth = hypeDocument.getElementProperty(container, 'width');
        const containerHeight = hypeDocument.getElementProperty(container, 'height');
        const elementWidth = hypeDocument.getElementProperty(element, 'width');
        const elementHeight = hypeDocument.getElementProperty(element, 'height');

        // For parent containment, bounds are relative to parent (0,0 origin)
        // For class selector containment, bounds are absolute scene coordinates
        if (containment === 'parent') {
            return {
                minX: 0,
                maxX: containerWidth - elementWidth,
                minY: 0,
                maxY: containerHeight - elementHeight
            };
        } else {
            const containerLeft = hypeDocument.getElementProperty(container, 'left');
            const containerTop = hypeDocument.getElementProperty(container, 'top');
            return {
                minX: containerLeft,
                maxX: containerLeft + containerWidth - elementWidth,
                minY: containerTop,
                maxY: containerTop + containerHeight - elementHeight
            };
        }
    }


    /**
     * The main drag event handler. Manages start, move, and end phases of a drag.
     * This function is intended to be called by Hype's "On Drag" event.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element being dragged.
     * @param {object} event - The Hype drag event object.
     */
    function handler(hypeDocument, element, event) {
        const doc = _getDocRegistry(hypeDocument);
        const dragName = element.dataset.dragName;
        if (!dragName) {
            console.warn('HypeDragController: Draggable element is missing a "data-drag-name" attribute.', element);
            return;
        }
        const finalOptions = getDefault();

        if (event.hypeGesturePhase === 'start') {
            // Optimize: Use cached initial position if available, otherwise get and set it.
            let initialLeft, initialTop;
            if (element.hasAttribute('data-initial-left')) {
                initialLeft = parseFloat(element.getAttribute('data-initial-left'));
                initialTop = parseFloat(element.getAttribute('data-initial-top'));
            } else {
                initialLeft = hypeDocument.getElementProperty(element, 'left');
                initialTop = hypeDocument.getElementProperty(element, 'top');
                element.setAttribute('data-initial-left', initialLeft);
                element.setAttribute('data-initial-top', initialTop);
            }
            
            doc.dragData[dragName] = { initialLeft: initialLeft, initialTop: initialTop, initialZ: hypeDocument.getElementProperty(element, 'z-index'), startX: event.hypeGestureXPosition, startY: event.hypeGestureYPosition, isActive: true };
            if (finalOptions.bringToFront) { hypeDocument.setElementProperty(element, 'z-index', 9999); }
            
            // Execute onStart callback if available
            const interaction = doc.interactionMap?.[dragName];
            if (interaction && typeof interaction.onStart === 'function') {
                interaction.onStart(hypeDocument, element, event);
            }
        }

        if (event.hypeGesturePhase === 'move' && doc.dragData[dragName]) {
            const data = doc.dragData[dragName];
            let newLeft = data.initialLeft + (event.hypeGestureXPosition - data.startX);
            let newTop = data.initialTop + (event.hypeGestureYPosition - data.startY);

            // Apply constraints
            const constraints = doc.constraints?.[dragName];
            if (constraints) {
                // Boundary constraints
                if (constraints.minX !== undefined) newLeft = Math.max(newLeft, constraints.minX);
                if (constraints.maxX !== undefined) newLeft = Math.min(newLeft, constraints.maxX);
                if (constraints.minY !== undefined) newTop = Math.max(newTop, constraints.minY);
                if (constraints.maxY !== undefined) newTop = Math.min(newTop, constraints.maxY);

                // Axis constraints
                if (constraints.axis === 'x') newTop = data.initialTop;
                if (constraints.axis === 'y') newLeft = data.initialLeft;

                // Containment constraints
                if (constraints.containment) {
                    const bounds = _getContainmentBounds(element, constraints.containment, hypeDocument);
                    // Only apply containment bounds if we got valid bounds (not null)
                    if (bounds) {
                        newLeft = Math.max(bounds.minX, Math.min(newLeft, bounds.maxX));
                        newTop = Math.max(bounds.minY, Math.min(newTop, bounds.maxY));
                    }
                    // If containment failed, axis/boundary constraints are still preserved
                }
            }

            hypeDocument.setElementProperty(element, 'left', newLeft);
            hypeDocument.setElementProperty(element, 'top', newTop);

            // Execute onProgress callback if available
            const interaction = doc.interactionMap?.[dragName];
            if (interaction && typeof interaction.onProgress === 'function') {
                interaction.onProgress(hypeDocument, element, event);
            }
        }

        if ((event.hypeGesturePhase === 'end' || event.hypeGesturePhase === 'cancel') && doc.dragData[dragName] && doc.dragData[dragName].isActive) {
            const data = doc.dragData[dragName];
            data.isActive = false; 
            const dropTarget = _getDropTarget(element, hypeDocument);
            
            // Add dropTarget to the event object to unify callback signatures
            event.dropTarget = dropTarget;
            
            const interaction = doc.interactionMap?.[dragName];
            if (interaction && typeof interaction.onDrop === 'function') {
                interaction.onDrop(hypeDocument, element, event);
            }
            setTimeout(() => { delete doc.dragData[dragName]; }, 50);
        }
    }
    
    /**
     * Animates an element back to its initial position.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element to snap back.
     */
    function snapBack(hypeDocument, element) {
        const doc = _getDocRegistry(hypeDocument);
        const dragName = element.dataset.dragName;
        if (!dragName) return;
        const data = doc.dragData[dragName];
        if (!data) return;
        const opts = getDefault();
        hypeDocument.setElementProperty(element, 'left', data.initialLeft, opts.snapBackDuration, opts.snapBackTiming);
        hypeDocument.setElementProperty(element, 'top', data.initialTop, opts.snapBackDuration, opts.snapBackTiming);
        if (opts.bringToFront) {
            hypeDocument.setElementProperty(element, 'z-index', data.initialZ, opts.snapBackDuration, 'easeinout');
        }
    }

    /**
     * Snaps a dragged element to a destination element or selector.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} draggedElement - The element that was dragged.
     * @param {HTMLElement|string} destination - The destination element or a CSS selector for it.
     */
    function snapTo(hypeDocument, draggedElement, destination) {
        if (!draggedElement || !destination) return;
        let destElement = null;
        if (typeof destination === 'string') {
            destElement = hypeDocument.getElementById(hypeDocument.currentSceneId()).querySelector(destination);
            if (!destElement) { return console.warn('HypeDragController: snapTo selector "' + destination + '" did not find an element.'); }
        } else if (typeof destination === 'object' && destination.id) {
            destElement = destination;
        } else { return console.warn('HypeDragController: snapTo destination must be an element or selector string.'); }

        const opts = getDefault();
        const destLeft = hypeDocument.getElementProperty(destElement, 'left');
        const destTop = hypeDocument.getElementProperty(destElement, 'top');
        hypeDocument.setElementProperty(draggedElement, 'left', destLeft, opts.snapToDuration, opts.snapToTiming);
        hypeDocument.setElementProperty(draggedElement, 'top', destTop, opts.snapToDuration, opts.snapToTiming);
    }

    /**
     * Locks a draggable element, preventing all pointer events on it and its children.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element to lock.
     */
    function lock(hypeDocument, element) { element.classList.add('hypeDragElementLocked'); }
    
    /**
     * Unlocks a draggable element, re-enabling pointer events.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element to unlock.
     */
    function unlock(hypeDocument, element) { element.classList.remove('hypeDragElementLocked'); }

    /**
     * Sets the interaction map for the current Hype document.
     * The map defines behavior for drag-and-drop interactions.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {object} map - The interaction map object.
     */
    function setInteractionMap(hypeDocument, map) { _getDocRegistry(hypeDocument).interactionMap = map; }

    /**
     * Sets drag constraints for draggable elements.
     * Constraints limit where elements can be moved during dragging.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement|string|Array} elements - The draggable element(s) to constrain, drag name string(s), or an array of either.
     * @param {object} constraints - The constraint configuration object.
     * @param {number} [constraints.minX] - Minimum X position allowed.
     * @param {number} [constraints.maxX] - Maximum X position allowed.
     * @param {number} [constraints.minY] - Minimum Y position allowed.
     * @param {number} [constraints.maxY] - Maximum Y position allowed.
     * @param {string} [constraints.axis] - Restrict movement to 'x' or 'y' axis only.
     * @param {string} [constraints.containment] - CSS class selector (e.g., '.gameArea') or 'parent' to contain movement within.
     */
    function setConstraints(hypeDocument, elements, constraints) {
        const doc = _getDocRegistry(hypeDocument);

        // Handle array of elements/strings
        if (Array.isArray(elements)) {
            elements.forEach(element => {
                _applyConstraintsToElement(hypeDocument, doc, element, constraints);
            });
            return;
        }

        // Handle single element/string
        _applyConstraintsToElement(hypeDocument, doc, elements, constraints);
    }

    /**
     * Applies constraints to a single element or drag name.
     * @private
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {object} doc - The document registry.
     * @param {HTMLElement|string} element - The element or drag name.
     * @param {object} constraints - The constraints to apply.
     */
    function _applyConstraintsToElement(hypeDocument, doc, element, constraints) {
        let dragName;
        let targetElement;

        // Handle both element objects and drag name strings
        if (typeof element === 'string') {
            // If element is a string, treat it as a drag name
            dragName = element;

            // Find the element by drag name to verify it exists
            const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
            targetElement = sceneEl.querySelector(`[data-drag-name="${dragName}"]`);
            if (!targetElement) {
                console.warn(`HypeDragController: No element found with data-drag-name="${dragName}".`, element);
                return;
            }
        } else {
            // If element is an object, get its drag name
            targetElement = element;
            dragName = element.dataset.dragName;
            if (!dragName) {
                console.warn('HypeDragController: Cannot set constraints on element without "data-drag-name" attribute.', element);
                return;
            }
        }

        doc.constraints[dragName] = constraints || {};
    }

    /**
     * Automatically reads and applies constraints from data attributes on draggable elements.
     * Called when each scene is prepared for display.
     * @private
     * @param {HypeDocument} hypeDocument - The Hype document object.
     */
    function _applyDataAttributeConstraints(hypeDocument) {
        const doc = _getDocRegistry(hypeDocument);
        const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
        const draggableElements = sceneEl.querySelectorAll('[data-drag-name]');

        draggableElements.forEach(element => {
            const dragName = element.dataset.dragName;

            // Check for constraint data attributes
            const constraints = {};

            // Boundary constraints
            if (element.hasAttribute('data-constraint-min-x')) {
                constraints.minX = parseFloat(element.getAttribute('data-constraint-min-x'));
            }
            if (element.hasAttribute('data-constraint-max-x')) {
                constraints.maxX = parseFloat(element.getAttribute('data-constraint-max-x'));
            }
            if (element.hasAttribute('data-constraint-min-y')) {
                constraints.minY = parseFloat(element.getAttribute('data-constraint-min-y'));
            }
            if (element.hasAttribute('data-constraint-max-y')) {
                constraints.maxY = parseFloat(element.getAttribute('data-constraint-max-y'));
            }

            // Axis constraint
            if (element.hasAttribute('data-constraint-axis')) {
                constraints.axis = element.getAttribute('data-constraint-axis');
            }

            // Containment constraint
            if (element.hasAttribute('data-constraint-containment')) {
                constraints.containment = element.getAttribute('data-constraint-containment');
            }

            // Only set constraints if any were found
            if (Object.keys(constraints).length > 0) {
                doc.constraints[dragName] = constraints;
            }
        });
    }

    /**
     * Resets all drag-related state for a scene - locks, cached positions, visual styling
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} [sceneElement] - Scene element, or current scene if omitted
     */
    function resetDragState(hypeDocument, sceneElement) {
        if (!sceneElement) {
            sceneElement = hypeDocument.getElementById(hypeDocument.currentSceneId());
        }
        
        // Clear all drag locks AND data attributes
        const allDraggables = sceneElement.querySelectorAll('[data-drag-name]');
        allDraggables.forEach(el => {
            unlock(hypeDocument, el);
            // Clear cached position data attributes
            el.removeAttribute('data-initial-left');
            el.removeAttribute('data-initial-top');
        });
        
        // Clear interaction data
        _getDocRegistry(hypeDocument).interactionMap = {};
        if (hypeDocument.customData) { 
            hypeDocument.customData.gameState = {}; 
        }
    }

    /**
     * Hype event callback triggered when a Hype document is loaded.
     * Initializes the drag controller API on the hypeDocument object.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element that triggered the event.
     * @param {object} event - The event object.
     */
    function HypeDocumentLoad(hypeDocument, element, event) {
        _injectStyle();
        hypeDocument.drag = {
            handler: handler.bind(null, hypeDocument),
            snapBack: snapBack.bind(null, hypeDocument),
            snapTo: snapTo.bind(null, hypeDocument),
            lock: lock.bind(null, hypeDocument),
            unlock: unlock.bind(null, hypeDocument),
            setInteractionMap: setInteractionMap.bind(null, hypeDocument),
            setConstraints: setConstraints.bind(null, hypeDocument),
            resetState: resetDragState.bind(null, hypeDocument)
        };
        hypeDocument.customData.gameState = {};

    }

    /**
     * Hype event callback triggered when a Hype scene is prepared for display.
     * Automatically applies constraints from data attributes on draggable elements.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element that triggered the event.
     * @param {object} event - The event object.
     */
    function HypeScenePrepareForDisplay(hypeDocument, element, event) {
        _applyDataAttributeConstraints(hypeDocument);
    }

    /**
     * Hype event callback triggered when a Hype scene is unloaded.
     * Clears the interaction map and game state to prevent data leakage between scenes.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element that triggered the event.
     * @param {object} event - The event object.
     */
    function HypeSceneUnload(hypeDocument, element, event) {
        if (getDefault('resetOnSceneUnload')) {
            resetDragState(hypeDocument, element);
        }
    }

    if ("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = []; }
    window.HYPE_eventListeners.push({ type: "HypeDocumentLoad", callback: HypeDocumentLoad });
    window.HYPE_eventListeners.push({ type: "HypeScenePrepareForDisplay", callback: HypeScenePrepareForDisplay });
    window.HYPE_eventListeners.push({ type: "HypeSceneUnload", callback: HypeSceneUnload });

    return { 
        version: _version, 
        setDefault: setDefault, 
        getDefault
    };

})();
