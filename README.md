# CutMaster
Plan cut lists for lumber

## Install dependencies
```
pip install -r requirements.txt
```

## Run the app
navigate to the directory containing the app folder (CutMaster folder) and run the following command:
```
python -m uvicorn app.main:app --reload --port 9988
```

open a web browser and navigate to:
* [http://127.0.0.1:9988](localhost:9988)

## Screenshots
Add boards manually or with the example boards.json. Inventory is shown below.
![image](https://github.com/user-attachments/assets/35326e2e-5afa-4650-8884-5727001962e1)

Select a cutlist (example: cutlist.json) and select the method for optimizing the layout from the dropdown (configurable on the Cost Configuration tab).
![image](https://github.com/user-attachments/assets/0e713657-56a7-4475-91c9-151f782e2b3a)

