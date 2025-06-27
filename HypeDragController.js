/*!
 * Hype Drag Controller v1.2.1
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
 */

if ("HypeDragController" in window === false) {
    window['HypeDragController'] = (function() {

        const _version = "1.2.1";

        let _default = {
            bringToFront: true,
            snapBackDuration: 0.4,
            snapBackTiming: 'easeinout',
            snapToDuration: 0.3,
            snapToTiming: 'easeout',
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
                _documents[docId] = { dragData: {}, interactionMap: {} };
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
                const newLeft = data.initialLeft + (event.hypeGestureXPosition - data.startX);
                const newTop = data.initialTop + (event.hypeGestureYPosition - data.startY);
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
                const interaction = doc.interactionMap?.[dragName];
                if (interaction && typeof interaction.onDrop === 'function') {
                    interaction.onDrop(hypeDocument, element, dropTarget);
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
                setInteractionMap: setInteractionMap.bind(null, hypeDocument)
            };
            hypeDocument.customData.gameState = {};
        }
        
        /**
         * Hype event callback triggered when a Hype scene is unloaded.
         * Clears the interaction map and game state to prevent data leakage between scenes.
         * @param {HypeDocument} hypeDocument - The Hype document object.
         * @param {HTMLElement} element - The element that triggered the event.
         * @param {object} event - The event object.
         */
        function HypeSceneUnload(hypeDocument, element, event) {
            _getDocRegistry(hypeDocument).interactionMap = {};
            if (hypeDocument.customData) { hypeDocument.customData.gameState = {}; }
        }

        if ("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = []; }
        window.HYPE_eventListeners.push({ type: "HypeDocumentLoad", callback: HypeDocumentLoad });
        window.HYPE_eventListeners.push({ type: "HypeSceneUnload", callback: HypeSceneUnload });

        return { 
            version: _version, 
            setDefault: setDefault, 
            getDefault: getDefault
        };

    })();
} 
