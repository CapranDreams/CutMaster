from pydantic import BaseModel
from typing import List, Optional

class CutItem(BaseModel):
    length: float
    width: float

class CutList(BaseModel):
    cuts: List[CutItem]

class BoardItem(BaseModel):
    length: float
    width: float
    depth: float
    cost: Optional[float] = 0.0

class BoardSupply(BaseModel):
    supply: List[BoardItem]

class CutPlacement(BaseModel):
    cut_id: int
    x: float
    y: float
    length: float
    width: float
    rotated: bool

class BoardCutPlan(BaseModel):
    board_id: int
    board_length: float
    board_width: float
    cuts: List[CutPlacement]
    waste_percentage: float

class OptimizationResult(BaseModel):
    board_plans: List[BoardCutPlan]
    total_waste_percentage: float
    total_cost: float
    unplaced_cuts: List[CutItem] = []

class OptimizationConfig(BaseModel):
    optimize_for: str = "waste"  # "waste" or "cost"

class BoardCostConfig(BaseModel):
    cost_per_unit: float = 1.00  # Cost per board foot 