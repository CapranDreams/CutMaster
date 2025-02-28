from pydantic import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Cutting Optimizer"
    app_description: str = "Optimize cutting patterns for 2D shapes"
    
    class Config:
        env_file = ".env"

settings = Settings() 