import psycopg2 as postgres
import csv
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ADMIN_TOKEN = input("Enter admin token: ")

def file_by_dep(dep):
    return f"/images/achivements/dep/{dep}.png"

def file_no_dep(id):
    return f"/images/achivements/nodep/{id}.png"

con = postgres.connect(
    host="10.8.0.1",
    port=5432,
    user="scv",
    password=input("ur password: "),
    database="letovo_db",
)

cur = con.cursor()

def no_dep_achivements():
    with open('Achivments.csv', 'r') as f:
        reader = csv.reader(f, delimiter=',')
        next(reader)  # Skip header
        for row in reader:
            if len(row) < 4:
                continue
            id, name, description, stages = row[0], row[1], row[2], row[3]
            cur.execute(
                "INSERT INTO achivements (achivement_name, achivement_decsription, departmentid, stages, achivement_pic) VALUES (%s, %s, -1, %s, %s)",
                (name, description, stages, file_no_dep(id))
            )
        con.commit()

def dep_achivements():
    with open('Dep_Achivments.csv', 'r') as f:
        reader = csv.reader(f, delimiter=',')
        next(reader)  # Skip header
        for row in reader:
            if len(row) < 5:
                continue
            id, name, description, stages, dep = row[0], row[1], row[2], row[3], row[4]
            cur.execute(
                "INSERT INTO achivements (achivement_name, achivement_decsription, departmentid, stages, achivement_pic) VALUES (%s, %s, %s, %s, %s)",
                (name, description, id[-1], stages, file_by_dep(id))
            )
        con.commit()

def roles():
    roles = {
        "Старший": 0
    }
    i = 1
    for role, exp in roles.items():
        for dep_id in range(1, 8):
            cur.execute(
                "INSERT INTO roles (rolename, rang, departmentid, payment) VALUES (%s, %s, %s, %s)",
                (role, i, dep_id, exp)
            )
        i += 1
    con.commit()

def elder_users():
    with open('teachers.csv', 'r') as f:
        elder_offset = 35
        reader = csv.reader(f, delimiter=',')
        next(reader)
        cur.execute("SELECT departmentid, departmentname FROM department")
        departments = {str(row[1]).lower(): row[0] for row in cur.fetchall()} 
        for row in reader:
            if len(row) < 4:
                continue
            name, password, dep_name, role = row[0], row[1], row[2].lower(), row[3]
            dep_id = departments.get(dep_name)
            if not dep_id:
                print(f"Department '{dep_name}' not found for user '{name}'. Skipping.")
                continue
            requests.post(
                "https://localhost/api/auth/reg", 
                json={
                    "login": name,
                    "password": password
                },
                verify=False
            )
            print(f"User {name} created, adding role {role}")
            requests.post(
                "https://localhost/api/user/add_role",
                json={
                    "username": name,
                    "role_id": elder_offset + departments[dep_name]
                },
                headers={"Bearer": f"{ADMIN_TOKEN}"},
                verify=False
            )
            print(f"Role {role} added to user {name} in department {dep_name}")
    

if __name__ == "__main__":
    elder_users()