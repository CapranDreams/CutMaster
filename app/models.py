from sqlalchemy import Column, Integer, Float, String, Boolean
from .database import Base

class Board(Base):
    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True)
    length = Column(Float)
    width = Column(Float)
    depth = Column(Float)
    
class BoardCost(Base):
    __tablename__ = "board_costs"
    
    id = Column(Integer, primary_key=True, index=True)
    cost_per_unit = Column(Float)  # Cost per board foot
    description = Column(String, nullable=True, default="Cost per board foot") 