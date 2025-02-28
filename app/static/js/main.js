document.addEventListener('DOMContentLoaded', function() {
    // Load inventory on page load
    loadInventory();
    
    // Set up form submissions
    document.getElementById('upload-boards-form').addEventListener('submit', uploadBoards);
    document.getElementById('optimize-cuts-form').addEventListener('submit', optimizeCuts);
    document.getElementById('board-cost-form').addEventListener('submit', setBoardCost);
    
    // Set up button actions
    document.getElementById('accept-cuts-btn').addEventListener('click', acceptCuts);
    document.getElementById('reject-cuts-btn').addEventListener('click', rejectCuts);
});

// Tab functionality
function openTab(tabName) {
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }
    
    // Remove active class from all tab buttons
    const tabButtons = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }
    
    // Show the selected tab content and mark the button as active
    document.getElementById(tabName).classList.add('active');
    
    // Find the button that corresponds to this tab
    const buttons = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute('onclick').includes(tabName)) {
            buttons[i].classList.add('active');
        }
    }

    // Load specific content based on tab
    if (tabName === 'inventory') {
        loadInventory();
    } else if (tabName === 'config') {
        loadCostConfig();
    }
}

// Load board inventory
async function loadInventory() {
    try {
        const response = await fetch('/board-inventory');
        const boardGroups = await response.json();
        
        const inventoryList = document.getElementById('inventory-list');
        
        if (boardGroups.length === 0) {
            inventoryList.innerHTML = '<p>No boards in inventory. Upload boards to get started.</p>';
            return;
        }
        
        let html = `
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Dimensions (L×W×D)</th>
                        <th>Quantity</th>
                        <th>Board Feet</th>
                        <th>Cost (each)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        boardGroups.forEach(group => {
            const boardFeet = (group.length * group.width * group.depth / 144).toFixed(2);
            html += `
                <tr>
                    <td>${group.length}" × ${group.width}" × ${group.depth}"</td>
                    <td>${group.quantity}</td>
                    <td>${boardFeet}</td>
                    <td>$${group.cost.toFixed(2)}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        inventoryList.innerHTML = html;
    } catch (error) {
        console.error('Error loading inventory:', error);
        inventoryList.innerHTML = '<p>Error loading inventory. Please try again.</p>';
    }
}

// Upload boards
async function uploadBoards(event) {
    event.preventDefault();
    
    const formData = new FormData(document.getElementById('upload-boards-form'));
    const fileInput = document.getElementById('boards-file');
    
    // Check if a file was selected
    if (fileInput.files.length === 0) {
        // No file selected, use manual entry
        const quantity = parseInt(document.getElementById('board-quantity').value) || 1;
        const length = parseFloat(document.getElementById('board-length').value);
        const width = parseFloat(document.getElementById('board-width').value);
        const depth = parseFloat(document.getElementById('board-depth').value);
        
        // Validate inputs
        if (!length || !width || !depth) {
            alert('Please enter valid dimensions for the board.');
            return;
        }
        
        // Create a boards.json structure with the manual entries
        const boardsData = {
            supply: []
        };
        
        // Add the specified quantity of boards
        for (let i = 0; i < quantity; i++) {
            boardsData.supply.push({
                length: length,
                width: width,
                depth: depth
            });
        }
        
        // Create a blob and attach it to the form data
        const blob = new Blob([JSON.stringify(boardsData)], { type: 'application/json' });
        formData.set('file', blob, 'manual-entry.json');
    }
    
    try {
        const response = await fetch('/upload-boards', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            loadInventory();
            document.getElementById('upload-boards-form').reset();
        } else {
            alert('Error: ' + result.detail);
        }
    } catch (error) {
        console.error('Error uploading boards:', error);
        alert('Error uploading boards. Please try again.');
    }
}

// Optimize cuts
let currentOptimizationResult = null;

async function optimizeCuts(event) {
    event.preventDefault();
    
    const formData = new FormData(document.getElementById('optimize-cuts-form'));
    
    try {
        const response = await fetch('/optimize-cuts', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Store the result for later use
            currentOptimizationResult = result;
            
            // Display the results
            displayOptimizationResults(result);
            
            // Show the results section
            document.getElementById('optimization-results').classList.remove('hidden');
        } else {
            alert('Error: ' + result.detail);
        }
    } catch (error) {
        console.error('Error optimizing cuts:', error);
        alert('Error optimizing cuts. Please try again.');
    }
}

// Draw board plan on canvas
function drawBoardPlan(canvas, plan) {
    const ctx = canvas.getContext('2d');
    
    // Set high-resolution canvas
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set the canvas size with higher resolution
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Scale the context to ensure correct drawing
    ctx.scale(dpr, dpr);
    
    // Set canvas CSS size
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate the scale factor based on the canvas size and board dimensions
    const scaleX = rect.width / plan.board_length;
    const scaleY = rect.height / plan.board_width;
    const useScale = Math.min(scaleX, scaleY);
    
    // Create wood texture pattern
    const woodPattern = createWoodPattern(ctx, plan.board_length * useScale, plan.board_width * useScale);
    
    // Draw board background with wood texture
    ctx.fillStyle = woodPattern;
    ctx.fillRect(0, 0, plan.board_length * useScale, plan.board_width * useScale);
    
    // Draw 1-foot grid
    ctx.strokeStyle = 'rgba(150, 120, 100, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([5, 5]); // Dashed line
    
    // Draw vertical grid lines (every 12 inches)
    for (let x = 12; x < plan.board_length; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x * useScale, 0);
        ctx.lineTo(x * useScale, plan.board_width * useScale);
        ctx.stroke();
    }
    
    // Draw horizontal grid lines (every 12 inches)
    for (let y = 12; y < plan.board_width; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y * useScale);
        ctx.lineTo(plan.board_length * useScale, y * useScale);
        ctx.stroke();
    }
    
    // Reset line dash
    ctx.setLineDash([]);
    
    // Draw board border
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, plan.board_length * useScale, plan.board_width * useScale);
    
    // Draw cuts
    plan.cuts.forEach((cut, index) => {
        // Choose color based on cut width instead of index
        // Create a color scale from narrow to wide cuts
        const colorScale = getColorForWidth(cut.width);
        ctx.fillStyle = colorScale;
        
        // Calculate dimensions and position
        const x = cut.x * useScale;
        const y = cut.y * useScale;
        const width = cut.length * useScale;
        const height = cut.width * useScale;
        
        // Draw the cut with a slight shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(x, y, width, height);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
        
        // Create label text
        const labelText = `${cut.length}×${cut.width}`;
        
        // Calculate center position
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        // Always try to place text in the center first
        // Calculate optimal font size to fit within the cut
        const minDimension = Math.min(width, height);
        let fontSize = Math.min(16, minDimension / 2);
        
        // Use a crisp font rendering approach
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Measure text width
        let textWidth = ctx.measureText(labelText).width;
        
        // Reduce font size until it fits with some padding
        while (textWidth > width - 10 && fontSize > 6) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
            textWidth = ctx.measureText(labelText).width;
        }
        
        // If the text can fit (with a minimum readable size), draw it inside
        if (fontSize >= 6 && textWidth <= width - 6 && fontSize * 1.2 <= height) {
            // Draw text with improved rendering
            // First draw shadow
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Draw text fill
            ctx.fillStyle = 'white';
            ctx.fillText(labelText, centerX, centerY);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        } else {
            // For cuts too small for internal text, draw external label
            // but ensure it's centered on the cut
            
            // Determine best position for external label
            // Always try to place it on the right side first, then left, then top, then bottom
            let labelX, labelY;
            
            // Determine which edge of the board the cut is closest to
            const distToLeft = x;
            const distToRight = plan.board_length * useScale - (x + width);
            const distToTop = y;
            const distToBottom = plan.board_width * useScale - (y + height);
            
            // Find the closest edge
            const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            
            // Position label based on closest edge
            if (minDist === distToRight) {
                // Right edge is closest
                labelX = x + width + 15;
                labelY = centerY;
                ctx.textAlign = 'left';
            } else if (minDist === distToLeft) {
                // Left edge is closest
                labelX = x - 15;
                labelY = centerY;
                ctx.textAlign = 'right';
            } else if (minDist === distToTop) {
                // Top edge is closest
                labelX = centerX;
                labelY = y - 15;
                ctx.textAlign = 'center';
            } else {
                // Bottom edge is closest
                labelX = centerX;
                labelY = y + height + 15;
                ctx.textAlign = 'center';
            }
            
            // Draw connecting line from center of cut to label
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(labelX, labelY);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Draw text with background for better visibility
            ctx.font = `bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 12; // Approximate height
            
            // Calculate background position based on text alignment
            let bgX;
            if (ctx.textAlign === 'right') {
                bgX = labelX - textWidth - 4;
            } else if (ctx.textAlign === 'left') {
                bgX = labelX - 4;
            } else { // center
                bgX = labelX - textWidth/2 - 4;
            }
            
            // Calculate background position based on whether label is above or below
            let bgY;
            if (labelY < centerY) { // Label is above the cut
                bgY = labelY - textHeight - 2;
                ctx.textBaseline = 'bottom';
            } else { // Label is below or beside the cut
                bgY = labelY - textHeight/2 - 2;
                ctx.textBaseline = 'middle';
            }
            
            // Draw background with border
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(
                bgX,
                bgY,
                textWidth + 8,
                textHeight + 4
            );
            
            // Draw text with improved rendering
            ctx.fillStyle = 'white';
            ctx.fillText(labelText, labelX, labelY);
        }
    });
}

// Function to get color based on width
function getColorForWidth(width) {
    // Define color ranges for different widths
    // Using a gradient from cool colors (narrow) to warm colors (wide)
    
    // Define width ranges and corresponding colors
    const colorRanges = [
        { maxWidth: 2, color: 'rgba(65, 105, 225, 0.9)' },   // Royal Blue (narrow)
        { maxWidth: 3, color: 'rgba(100, 149, 237, 0.9)' },  // Cornflower Blue
        { maxWidth: 4, color: 'rgba(0, 191, 255, 0.9)' },    // Deep Sky Blue
        { maxWidth: 5, color: 'rgba(0, 206, 209, 0.9)' },    // Turquoise
        { maxWidth: 6, color: 'rgba(46, 204, 113, 0.9)' },   // Green
        { maxWidth: 8, color: 'rgba(241, 196, 15, 0.9)' },   // Yellow
        { maxWidth: 10, color: 'rgba(230, 126, 34, 0.9)' },  // Orange
        { maxWidth: 12, color: 'rgba(231, 76, 60, 0.9)' },   // Red (wide)
        { maxWidth: Infinity, color: 'rgba(142, 68, 173, 0.9)' } // Purple (very wide)
    ];
    
    // Find the appropriate color for the width
    for (const range of colorRanges) {
        if (width <= range.maxWidth) {
            return range.color;
        }
    }
    
    // Default color if no range matches (shouldn't happen with Infinity as last maxWidth)
    return 'rgba(52, 73, 94, 0.9)'; // Dark blue-gray
}

// Create a wood texture pattern
function createWoodPattern(ctx, width, height) {
    // Create a small canvas for the pattern
    const patternCanvas = document.createElement('canvas');
    const patternContext = patternCanvas.getContext('2d');
    
    // Set pattern size
    patternCanvas.width = 200;
    patternCanvas.height = 200;
    
    // Base wood color
    const baseColor = '#f0e4d4';
    patternContext.fillStyle = baseColor;
    patternContext.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
    
    // Add wood grain
    const grainColors = ['#e8d8c0', '#d9c7a8', '#e5d6bc', '#ecdcc8'];
    
    // Create horizontal wood grain
    for (let i = 0; i < 40; i++) {
        const y = Math.random() * patternCanvas.height;
        const grainWidth = Math.random() * 2 + 1;
        const colorIndex = Math.floor(Math.random() * grainColors.length);
        
        patternContext.beginPath();
        patternContext.moveTo(0, y);
        
        // Create wavy grain lines
        for (let x = 0; x < patternCanvas.width; x += 20) {
            const yOffset = Math.random() * 4 - 2;
            patternContext.lineTo(x, y + yOffset);
        }
        
        patternContext.strokeStyle = grainColors[colorIndex];
        patternContext.lineWidth = grainWidth;
        patternContext.globalAlpha = 0.4;
        patternContext.stroke();
    }
    
    // Add some knots/features
    for (let i = 0; i < 3; i++) {
        const x = Math.random() * patternCanvas.width;
        const y = Math.random() * patternCanvas.height;
        const radius = Math.random() * 5 + 3;
        
        const gradient = patternContext.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, '#d2b48c');
        gradient.addColorStop(0.5, '#c19a6b');
        gradient.addColorStop(1, baseColor);
        
        patternContext.globalAlpha = 0.6;
        patternContext.beginPath();
        patternContext.arc(x, y, radius, 0, Math.PI * 2);
        patternContext.fillStyle = gradient;
        patternContext.fill();
    }
    
    // Reset alpha
    patternContext.globalAlpha = 1;
    
    // Create pattern from the canvas
    return ctx.createPattern(patternCanvas, 'repeat');
}

// Display optimization results
function displayOptimizationResults(result) {
    // Update summary information
    document.getElementById('total-waste').textContent = result.total_waste_percentage.toFixed(2);
    document.getElementById('total-cost').textContent = result.total_cost.toFixed(2);
    document.getElementById('boards-used').textContent = result.board_plans.length;
    
    // Check for unplaced cuts
    const unplacedCutsWarning = document.getElementById('unplaced-cuts-warning');
    const unplacedCutsList = document.getElementById('unplaced-cuts-list');
    
    if (result.unplaced_cuts && result.unplaced_cuts.length > 0) {
        unplacedCutsWarning.classList.remove('hidden');
        
        let unplacedHtml = '<ul>';
        result.unplaced_cuts.forEach(cut => {
            unplacedHtml += `<li>Cut: ${cut.length} x ${cut.width}</li>`;
        });
        unplacedHtml += '</ul>';
        
        unplacedCutsList.innerHTML = unplacedHtml;
    } else {
        unplacedCutsWarning.classList.add('hidden');
        unplacedCutsList.innerHTML = '';
    }
    
    // Display board plans
    const boardPlansContainer = document.getElementById('board-plans-container');
    boardPlansContainer.innerHTML = '';
    
    // Get the available width for the board plans
    const containerWidth = boardPlansContainer.clientWidth || 800; // Default to 800 if not yet in DOM
    const maxBoardWidth = Math.max(...result.board_plans.map(plan => plan.board_width));
    const maxBoardLength = Math.max(...result.board_plans.map(plan => plan.board_length));
    
    result.board_plans.forEach((plan, index) => {
        const boardPlanElement = document.createElement('div');
        boardPlanElement.className = 'board-plan';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'board-plan-header';
        header.innerHTML = `
            <span>Board #${plan.board_id} (${plan.board_length}" × ${plan.board_width}")</span>
            <span>Waste: ${plan.waste_percentage.toFixed(2)}%</span>
        `;
        boardPlanElement.appendChild(header);
        
        // Calculate the appropriate height based on the board's aspect ratio
        // Use a consistent scale across all boards based on the largest dimensions
        const aspectRatio = plan.board_width / plan.board_length;
        
        // Calculate height based on available width and aspect ratio
        // Add some padding (50px) for the header and margins
        const canvasWidth = containerWidth - 40; // 20px padding on each side
        const canvasHeight = Math.max(150, Math.min(600, canvasWidth * aspectRatio));
        
        // Create canvas container with calculated height
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'board-canvas-container';
        canvasContainer.style.width = '100%';
        canvasContainer.style.height = `${canvasHeight}px`;
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'board-canvas';
        canvasContainer.appendChild(canvas);
        boardPlanElement.appendChild(canvasContainer);
        
        // Add to container
        boardPlansContainer.appendChild(boardPlanElement);
        
        // Draw the board and cuts
        drawBoardPlan(canvas, plan);
    });
}

// Accept cuts
async function acceptCuts() {
    if (!currentOptimizationResult || !currentOptimizationResult.board_plans) {
        alert('No optimization results to accept.');
        return;
    }
    
    try {
        const response = await fetch('/accept-cuts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentOptimizationResult.board_plans)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            
            // Reset the optimization results
            document.getElementById('optimization-results').classList.add('hidden');
            currentOptimizationResult = null;
            
            // Refresh inventory
            loadInventory();
            
            // Switch to inventory tab
            openTab('inventory');
        } else {
            alert('Error: ' + result.detail);
        }
    } catch (error) {
        console.error('Error accepting cuts:', error);
        alert('Error accepting cuts. Please try again.');
    }
}

// Reject cuts
function rejectCuts() {
    // Hide the results section
    document.getElementById('optimization-results').classList.add('hidden');
    
    // Clear the current optimization result
    currentOptimizationResult = null;
}

// Set board cost
async function setBoardCost(event) {
    event.preventDefault();
    
    const formData = new FormData(document.getElementById('board-cost-form'));
    const boardCostConfig = {
        cost_per_unit: parseFloat(formData.get('cost_per_unit'))
    };
    
    try {
        const response = await fetch('/board-cost-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(boardCostConfig)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            document.getElementById('board-cost-form').reset();
            // Refresh inventory to show updated costs
            loadInventory();
        } else {
            alert('Error: ' + result.detail);
        }
    } catch (error) {
        console.error('Error setting board cost:', error);
        alert('Error setting board cost. Please try again.');
    }
}

// Load board cost configuration
async function loadCostConfig() {
    try {
        const response = await fetch('/board-cost-config');
        const config = await response.json();
        
        // Populate the form with current values
        if (config && config.cost_per_unit !== undefined) {
            document.getElementById('cost-per-unit').value = config.cost_per_unit;
        }
    } catch (error) {
        console.error('Error loading board cost configuration:', error);
        // Don't show an error to the user, just log it
    }
}