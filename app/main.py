from fastapi import FastAPI, Depends, HTTPException, Request, Form, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import json
import os
from typing import List, Optional

from . import models, schemas, database, optimizer
from .database import engine, get_db


# Database Setup ------------------------------------------------------------
def recreate_database():
    """Drop all tables and recreate them"""
    # Check if database file exists and delete it
    if os.path.exists("./boards.db"):
        os.remove("./boards.db")
    
    # Create tables
    models.Base.metadata.create_all(bind=engine)
    
    print("Database recreated successfully!")

# Replace the existing create_all line with this
if not os.path.exists("./boards.db"):
    # Create tables only if database doesn't exist
    models.Base.metadata.create_all(bind=engine)
    print("Database created successfully!")
# End Database Setup --------------------------------------------------------

app = FastAPI(title="Cutting Optimizer")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Set up templates
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload-boards")
async def upload_boards(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        contents = await file.read()
        data = json.loads(contents)
        
        # Validate the data structure
        if "supply" not in data or not isinstance(data["supply"], list):
            raise ValueError("Invalid JSON format: missing 'supply' array")
        
        # Process and validate dimensions before creating Pydantic model
        for item in data["supply"]:
            # Ensure all required fields exist
            if not all(key in item for key in ["length", "width", "depth"]):
                raise ValueError("Each board must have length, width, and depth")
                
            # Convert to float and truncate to 3 decimal places
            for key in ["length", "width", "depth"]:
                try:
                    # Convert to float first (handles both int and float inputs)
                    value = float(item[key])
                    # Truncate to 3 decimal places
                    item[key] = round(value * 1000) / 1000
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid {key} value: must be a number")
                
                # Ensure positive values
                if item[key] <= 0:
                    raise ValueError(f"{key.capitalize()} must be greater than zero")
            
        board_supply = schemas.BoardSupply(**data)
        
        if len(board_supply.supply) == 0:
            return {"message": "No boards to add"}
        
        for board in board_supply.supply:
            db_board = models.Board(
                length=board.length,
                width=board.width,
                depth=board.depth
            )
            db.add(db_board)
        
        db.commit()
        return {"message": f"Successfully added {len(board_supply.supply)} boards to inventory"}
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing request: {str(e)}")

@app.post("/optimize-cuts")
async def optimize_cuts_endpoint(
    file: UploadFile = File(...),
    optimize_for: str = Form("waste"),
    db: Session = Depends(get_db)
):
    try:
        contents = await file.read()
        data = json.loads(contents)
        
        # Validate the data structure
        if "cuts" not in data or not isinstance(data["cuts"], list):
            raise ValueError("Invalid JSON format: missing 'cuts' array")
            
        # Process and validate dimensions before creating Pydantic model
        for item in data["cuts"]:
            # Ensure all required fields exist
            if not all(key in item for key in ["length", "width"]):
                raise ValueError("Each cut must have length and width")
                
            # Convert to float and truncate to 3 decimal places
            for key in ["length", "width"]:
                try:
                    # Convert to float first (handles both int and float inputs)
                    value = float(item[key])
                    # Truncate to 3 decimal places
                    item[key] = round(value * 1000) / 1000
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid {key} value: must be a number")
                
                # Ensure positive values
                if item[key] <= 0:
                    raise ValueError(f"{key.capitalize()} must be greater than zero")
        
        cutlist = schemas.CutList(**data)
        config = schemas.OptimizationConfig(optimize_for=optimize_for)
        
        # Run optimization
        result = optimizer.optimize_cuts(db, cutlist, config)
        
        return result
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing request: {str(e)}")

@app.post("/accept-cuts")
async def accept_cuts(
    board_plans: List[schemas.BoardCutPlan],
    db: Session = Depends(get_db)
):
    try:
        # Update inventory by removing used boards
        optimizer.update_board_inventory(db, board_plans)
        
        # Generate cuts.json
        cuts_output = {
            "board_plans": [plan.dict() for plan in board_plans]
        }
        
        # Save to file
        with open("cuts.json", "w") as f:
            json.dump(cuts_output, f, indent=4)
        
        return {"message": "Cuts accepted and inventory updated", "cuts_file": "cuts.json"}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error accepting cuts: {str(e)}")

@app.get("/board-inventory")
async def get_board_inventory(db: Session = Depends(get_db)):
    boards = db.query(models.Board).all()
    
    # Get the current cost per board foot
    cost_config = db.query(models.BoardCost).first()
    cost_per_board_foot = 1.0  # Default value
    if cost_config:
        cost_per_board_foot = cost_config.cost_per_unit
    
    # Group identical boards
    board_groups = {}
    for board in boards:
        # Create a key based on dimensions
        key = f"{board.length}x{board.width}x{board.depth}"
        
        # Calculate cost
        cost = (board.length * board.width * board.depth / 144) * cost_per_board_foot
        
        if key in board_groups:
            board_groups[key]["quantity"] += 1
            # Add the board ID to the list of IDs (needed for backend operations)
            board_groups[key]["ids"].append(board.id)
        else:
            board_groups[key] = {
                "length": board.length,
                "width": board.width,
                "depth": board.depth,
                "cost": cost,
                "quantity": 1,
                "ids": [board.id]
            }
    
    # Convert to list and sort by width (primary) and length (secondary) in descending order
    board_list = list(board_groups.values())
    board_list.sort(key=lambda x: (x["width"], x["length"]), reverse=True)
    
    return board_list

@app.post("/board-cost-config")
async def set_board_cost_config(
    config: schemas.BoardCostConfig,
    db: Session = Depends(get_db)
):
    try:
        # Check if any cost config exists
        existing_config = db.query(models.BoardCost).first()
        
        if existing_config:
            existing_config.cost_per_unit = config.cost_per_unit
        else:
            new_config = models.BoardCost(
                cost_per_unit=config.cost_per_unit
            )
            db.add(new_config)
        
        db.commit()
        return {"message": "Board cost configuration updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating cost configuration: {str(e)}") 

@app.get("/board-cost-config")
async def get_board_cost_config(db: Session = Depends(get_db)):
    """Get the current board cost configuration"""
    config = db.query(models.BoardCost).first()
    
    if config:
        return {"cost_per_unit": config.cost_per_unit}
    else:
        # Return default values if no configuration exists
        return {"cost_per_unit": 1.0}