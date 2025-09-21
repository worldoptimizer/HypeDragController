/*!
 * Hype Drag Controller v1.4.1
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
 * 1.4.0   Added comprehensive drag constraint system with boundary, axis, and within-region restrictions.
 *          Enhanced to accept drag names, automatic data-attribute constraint loading, and array support for batch operations.
 * 1.4.1   Added auto-snap functionality to automatically snap elements to their constraints.
 */

if ("HypeDragController" in window === false) window['HypeDragController'] = (function() {
    const _version = "1.4.1";

    let _default = {
        bringToFront: true,
        snapBackDuration: 0.4,
        snapBackTiming: 'easeinout',
        snapToDuration: 0.3,
        snapToTiming: 'easeout',
        resetOnSceneUnload: false,
        autoSnap: false
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
            _documents[docId] = { dragData: {}, interactionMap: {}, constraints: {}, zCounter: 10000 };
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
     * Calculates the bounding rectangle for a within-region element.
     * @private
     * @param {HTMLElement} element - The element being dragged.
     * @param {string} within - CSS class selector or 'parent' for within-region bounds.
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @returns {object|null} Object with minX, maxX, minY, maxY properties, or null if the region can't be found.
     */
    function _getWithinBounds(element, within, hypeDocument) {
        let container;

        // Handle parent region - find closest Hype element
        if (within === 'parent') {
            const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
            container = element.parentElement.closest('.HYPE_element') || sceneEl;
        }
        // Handle CSS selector region
        else if (typeof within === 'string') {
            const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
            container = sceneEl.querySelector(within);
            if (!container) {
                console.warn('HypeDragController: Within selector "' + within + '" not found.', element);
                return null;
            }
        } else {
            console.warn('HypeDragController: Invalid within specification. Must be a CSS selector or "parent".', element);
            return null;
        }

        const containerWidth = hypeDocument.getElementProperty(container, 'width');
        const containerHeight = hypeDocument.getElementProperty(container, 'height');
        const elementWidth = hypeDocument.getElementProperty(element, 'width');
        const elementHeight = hypeDocument.getElementProperty(element, 'height');

        // For parent region, bounds are relative to parent (0,0 origin)
        // For selector region, bounds are absolute scene coordinates
        if (within === 'parent') {
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
     * Computes a constrained position given proposed left/top and a baseline for axis locks.
     * Centralizes boundary, axis and within-region calculations used during drag and auto snap.
     * @private
     * @param {HypeDocument} hypeDocument
     * @param {HTMLElement} element
     * @param {object} constraints
     * @param {number} proposedLeft
     * @param {number} proposedTop
     * @param {number} axisBaselineLeft - The reference left used when axis === 'y'
     * @param {number} axisBaselineTop - The reference top used when axis === 'x'
     * @returns {{left:number, top:number}}
     */
    function _computeConstrainedPosition(hypeDocument, element, constraints, proposedLeft, proposedTop, axisBaselineLeft, axisBaselineTop) {
        let newLeft = proposedLeft;
        let newTop = proposedTop;

        if (!constraints) {
            return { left: newLeft, top: newTop };
        }

        // Boundary constraints
        if (constraints.minX !== undefined) newLeft = Math.max(newLeft, constraints.minX);
        if (constraints.maxX !== undefined) newLeft = Math.min(newLeft, constraints.maxX);
        if (constraints.minY !== undefined) newTop = Math.max(newTop, constraints.minY);
        if (constraints.maxY !== undefined) newTop = Math.min(newTop, constraints.maxY);

        // Axis constraints
        if (constraints.axis === 'x') newTop = axisBaselineTop;
        if (constraints.axis === 'y') newLeft = axisBaselineLeft;

        // Within-region constraints
        if (constraints.within) {
            const bounds = _getWithinBounds(element, constraints.within, hypeDocument);
            if (bounds) {
                newLeft = Math.max(bounds.minX, Math.min(newLeft, bounds.maxX));
                newTop = Math.max(bounds.minY, Math.min(newTop, bounds.maxY));
            }
        }

        return { left: newLeft, top: newTop };
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
            // Always take the current position as the new drag baseline to avoid offset on repeated drags
            const initialLeft = hypeDocument.getElementProperty(element, 'left');
            const initialTop = hypeDocument.getElementProperty(element, 'top');
            // Refresh cached attributes so snapBack (which uses doc.dragData) stays correct for this session
            element.setAttribute('data-initial-left', initialLeft);
            element.setAttribute('data-initial-top', initialTop);

            doc.dragData[dragName] = { initialLeft: initialLeft, initialTop: initialTop, initialZ: hypeDocument.getElementProperty(element, 'z-index'), startX: event.hypeGestureXPosition, startY: event.hypeGestureYPosition, isActive: true };
            if (finalOptions.bringToFront) { hypeDocument.setElementProperty(element, 'z-index', ++doc.zCounter); }
            
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
                const result = _computeConstrainedPosition(
                    hypeDocument,
                    element,
                    constraints,
                    newLeft,
                    newTop,
                    /* axisBaselineLeft */ data.initialLeft,
                    /* axisBaselineTop  */ data.initialTop
                );
                newLeft = result.left;
                newTop = result.top;
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
     * @param {string} [constraints.within] - CSS selector (e.g., '.gameArea') or 'parent' to restrict movement within.
     * @param {boolean} [constraints.autoSnap] - If true (or omitted and default allows), snap immediately.
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

        // Trigger auto snap if requested via constraints or global default
        const hasAutoSnapFlag = constraints && Object.prototype.hasOwnProperty.call(constraints, 'autoSnap');
        const shouldSnap = hasAutoSnapFlag ? !!constraints.autoSnap : getDefault('autoSnap');
        if (shouldSnap) {
            // Defer to ensure element is fully positioned before snapping, mirroring data-attribute behavior
            setTimeout(() => { _applyAutoSnap(hypeDocument, targetElement); }, 0);
        }
    }

    /**
     * Applies constraints to an element's current position without requiring a drag operation.
     * This is used for auto snap functionality and other position adjustments.
     * @private
     * @param {HypeDocument} hypeDocument - The Hype document object.
     * @param {HTMLElement} element - The element to snap to constraints.
     */
    function _applyAutoSnap(hypeDocument, element) {
        const doc = _getDocRegistry(hypeDocument);
        const dragName = element.dataset.dragName;
        if (!dragName) return;

        const constraints = doc.constraints?.[dragName];
        if (!constraints) return;

        const currentLeft = hypeDocument.getElementProperty(element, 'left');
        const currentTop = hypeDocument.getElementProperty(element, 'top');
        const result = _computeConstrainedPosition(
            hypeDocument,
            element,
            constraints,
            currentLeft,
            currentTop,
            /* axisBaselineLeft */ currentLeft,
            /* axisBaselineTop  */ currentTop
        );
        const newLeft = result.left;
        const newTop = result.top;

        // Only update position if it actually changed (no animation for auto snap)
        if (newLeft !== currentLeft || newTop !== currentTop) {
            hypeDocument.setElementProperty(element, 'left', newLeft);
            hypeDocument.setElementProperty(element, 'top', newTop);

            // Update the initial position data attributes to reflect the new position
            // This prevents offset issues on subsequent drags
            element.setAttribute('data-initial-left', newLeft);
            element.setAttribute('data-initial-top', newTop);
        }
    }

    /**
     * Automatically reads and applies constraints from data attributes on draggable elements.
     * Also handles auto snap functionality if enabled globally or per-element.
     * Called when each scene is prepared for display.
     * @private
     * @param {HypeDocument} hypeDocument - The Hype document object.
     */
    function _applyDataAttributeConstraints(hypeDocument) {
        const doc = _getDocRegistry(hypeDocument);
        const sceneEl = hypeDocument.getElementById(hypeDocument.currentSceneId());
        const draggableElements = sceneEl.querySelectorAll('[data-drag-name]');
        const globalAutoSnap = getDefault('autoSnap');

        draggableElements.forEach(element => {
            const dragName = element.dataset.dragName;

            // Check for constraint data attributes (unified data-drag-* scheme)
            const constraints = {};

            // Boundary constraints
            if (element.hasAttribute('data-drag-min-x')) {
                constraints.minX = parseFloat(element.getAttribute('data-drag-min-x'));
            }
            if (element.hasAttribute('data-drag-max-x')) {
                constraints.maxX = parseFloat(element.getAttribute('data-drag-max-x'));
            }
            if (element.hasAttribute('data-drag-min-y')) {
                constraints.minY = parseFloat(element.getAttribute('data-drag-min-y'));
            }
            if (element.hasAttribute('data-drag-max-y')) {
                constraints.maxY = parseFloat(element.getAttribute('data-drag-max-y'));
            }

            // Axis constraint
            if (element.hasAttribute('data-drag-axis')) {
                constraints.axis = element.getAttribute('data-drag-axis');
            }

            // Within constraint
            if (element.hasAttribute('data-drag-within')) {
                constraints.within = element.getAttribute('data-drag-within');
            }

            // Only set constraints if any were found
            if (Object.keys(constraints).length > 0) {
                doc.constraints[dragName] = constraints;
            }

            // Apply auto snap if enabled globally or per-element (supports alias 'data-drag-autosnap')
            let elementAutoSnap = globalAutoSnap;
            if (element.hasAttribute('data-drag-auto-snap')) {
                elementAutoSnap = element.getAttribute('data-drag-auto-snap') === 'true';
            } else if (element.hasAttribute('data-drag-autosnap')) {
                elementAutoSnap = element.getAttribute('data-drag-autosnap') === 'true';
            }

            if (elementAutoSnap && Object.keys(constraints).length > 0) {
                // Use setTimeout to ensure element is fully positioned before snapping
                setTimeout(() => {
                    _applyAutoSnap(hypeDocument, element);
                }, 0);
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
            autoSnap: function(element) { _applyAutoSnap(hypeDocument, element); },
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
