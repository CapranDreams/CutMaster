import rectpack
from rectpack.pack_algo import PackingAlgorithm
from rectpack.maxrects import MaxRectsBssf
from typing import List, Dict, Tuple, Any
from sqlalchemy.orm import Session
from . import models, schemas
import math

def optimize_cuts(
    db: Session, 
    cutlist: schemas.CutList, 
    config: schemas.OptimizationConfig
) -> schemas.OptimizationResult:
    # Get all available boards from the database
    boards = db.query(models.Board).all()
    
    # Get the current cost per board foot
    cost_config = db.query(models.BoardCost).first()
    cost_per_board_foot = 1.0  # Default value
    if cost_config:
        cost_per_board_foot = cost_config.cost_per_unit
    
    # Convert boards to a format suitable for the algorithm
    available_boards = [
        {
            "id": board.id,
            "length": board.length,
            "width": board.width,
            "depth": board.depth,
            # Calculate cost at runtime
            "cost": (board.length * board.width * board.depth / 144) * cost_per_board_foot,  # Convert to board feet
            "area": board.length * board.width
        }
        for board in boards
    ]
    
    # Sort boards based on optimization criteria
    if config.optimize_for == "waste":
        # Sort by area (smallest first)
        available_boards.sort(key=lambda b: b["area"])
    else:  # optimize for cost
        # Sort by cost (cheapest first)
        available_boards.sort(key=lambda b: b["cost"])
    
    # Convert cuts to a format suitable for the algorithm
    cuts_to_place = []
    for i, cut in enumerate(cutlist.cuts):
        cuts_to_place.append({
            "id": i,
            "length": cut.length,
            "width": cut.width,
            "area": cut.length * cut.width
        })
    
    # Sort cuts by area (largest first) to place larger cuts first
    cuts_to_place.sort(key=lambda c: c["area"], reverse=True)
    
    # Initialize result
    result = schemas.OptimizationResult(
        board_plans=[],
        total_waste_percentage=0.0,
        total_cost=0.0,
        unplaced_cuts=[]
    )
    
    # Keep track of unplaced cuts
    unplaced_cuts = cuts_to_place.copy()
    
    # Try to place cuts on each board
    for board in available_boards:
        # Skip if no more cuts to place
        if not unplaced_cuts:
            break
            
        # Create a new packer for this board
        packer = rectpack.newPacker(
            mode=rectpack.PackingMode.Offline,
            bin_algo=rectpack.PackingBin.BNF,
            pack_algo=MaxRectsBssf,
            rotation=True
        )
        
        # Add the board as a bin
        packer.add_bin(board["length"], board["width"])
        
        # Add all unplaced cuts as rectangles
        for cut in unplaced_cuts:
            packer.add_rect(cut["length"], cut["width"], cut["id"])
        
        # Pack the rectangles
        packer.pack()
        
        # If no cuts were placed on this board, skip to the next board
        if not packer.rect_list():
            continue
        
        # Create a board plan
        board_plan = schemas.BoardCutPlan(
            board_id=board["id"],
            board_length=board["length"],
            board_width=board["width"],
            cuts=[],
            waste_percentage=0.0
        )
        
        # Add placed cuts to the board plan
        placed_cut_ids = set()
        for rect in packer.rect_list():
            bin_index, x, y, w, h, cut_id = rect
            
            # Determine if the cut was rotated
            original_cut = next(c for c in cuts_to_place if c["id"] == cut_id)
            rotated = not (w == original_cut["length"] and h == original_cut["width"])
            
            board_plan.cuts.append(
                schemas.CutPlacement(
                    cut_id=cut_id,
                    x=x,
                    y=y,
                    length=w,
                    width=h,
                    rotated=rotated
                )
            )
            placed_cut_ids.add(cut_id)
        
        # Calculate waste percentage for this board
        total_board_area = board["length"] * board["width"]
        used_area = sum(cut.length * cut.width for cut in board_plan.cuts)
        waste_percentage = (total_board_area - used_area) / total_board_area * 100
        board_plan.waste_percentage = waste_percentage
        
        # Add board plan to result
        result.board_plans.append(board_plan)
        result.total_cost += board["cost"]
        
        # Remove placed cuts from unplaced_cuts
        unplaced_cuts = [cut for cut in unplaced_cuts if cut["id"] not in placed_cut_ids]
    
    # Add any remaining unplaced cuts to the result
    for cut in unplaced_cuts:
        original_cut = cutlist.cuts[cut["id"]]
        result.unplaced_cuts.append(original_cut)
    
    # Calculate total waste percentage
    if result.board_plans:
        total_board_area = sum(board["length"] * board["width"] for board in available_boards[:len(result.board_plans)])
        total_used_area = sum(
            sum(cut.length * cut.width for cut in plan.cuts)
            for plan in result.board_plans
        )
        result.total_waste_percentage = (total_board_area - total_used_area) / total_board_area * 100
    
    return result

def update_board_inventory(db: Session, board_plans: List[schemas.BoardCutPlan]):
    """Remove used boards from inventory after cuts are accepted"""
    for plan in board_plans:
        # Delete the board from the database
        db.query(models.Board).filter(models.Board.id == plan.board_id).delete()
    
    db.commit() 