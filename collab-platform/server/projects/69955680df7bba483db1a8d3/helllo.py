import asyncio
import threading
import time
import json
import random
from functools import wraps
from datetime import datetime

# ==========================
# Decorator for logging
# ==========================
def log_execution(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        print(f"[LOG] Starting '{func.__name__}' at {datetime.now()}")
        result = func(*args, **kwargs)
        end = time.time()
        print(f"[LOG] Finished '{func.__name__}' in {end - start:.4f}s\n")
        return result
    return wrapper


# ==========================
# Generator example
# ==========================
def fibonacci(limit):
    a, b = 0, 1
    while a < limit:
        yield a
        a, b = b, a + b


# ==========================
# Custom Exception
# ==========================
class InsufficientBalanceError(Exception):
    pass


# ==========================
# Bank Account Class (OOP)
# ==========================
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.lock = threading.Lock()

    @log_execution
    def deposit(self, amount):
        with self.lock:
            if amount <= 0:
                raise ValueError("Deposit amount must be positive")
            self.balance += amount
            print(f"{self.owner} deposited {amount}. New balance: {self.balance}")

    @log_execution
    def withdraw(self, amount):
        with self.lock:
            if amount > self.balance:
                raise InsufficientBalanceError("Not enough balance")
            self.balance -= amount
            print(f"{self.owner} withdrew {amount}. New balance: {self.balance}")

    def __str__(self):
        return f"Account(owner={self.owner}, balance={self.balance})"


# ==========================
# Async function example
# ==========================
async def fetch_data(id):
    print(f"Fetching data for ID: {id}")
    await asyncio.sleep(random.uniform(0.5, 2))
    return {"id": id, "value": random.randint(1, 100)}


async def async_main():
    tasks = [fetch_data(i) for i in range(5)]
    results = await asyncio.gather(*tasks)
    print("\nAsync Results:")
    print(results)
    return results


# ==========================
# File handling example
# ==========================
@log_execution
def save_to_file(data, filename="data.json"):
    try:
        with open(filename, "w") as f:
            json.dump(data, f, indent=4)
        print(f"Data saved to {filename}")
    except IOError as e:
        print("File error:", e)


# ==========================
# Multithreading example
# ==========================
def threaded_transactions(account):
    try:
        for _ in range(3):
            amount = random.randint(10, 100)
            account.deposit(amount)
            time.sleep(random.uniform(0.2, 1))
            account.withdraw(random.randint(5, amount))
    except Exception as e:
        print("Thread error:", e)


# ==========================
# Main execution
# ==========================
@log_execution
def main():
    print("=== Fibonacci Generator ===")
    for num in fibonacci(50):
        print(num, end=" ")
    print("\n")

    print("=== Bank Account Simulation ===")
    account = BankAccount("Alice", 100)

    threads = []
    for i in range(3):
        t = threading.Thread(target=threaded_transactions, args=(account,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print("\nFinal Account:", account)

    print("\n=== Async Data Fetch ===")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    results = loop.run_until_complete(async_main())

    print("\n=== Save Results ===")
    save_to_file(results)


# ==========================
# Entry Point
# ==========================
if __name__ == "__main__":
    main()
