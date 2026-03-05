# Import the required libraries
import datetime  # Not used in the code

# Define a class for Bank Account
class BankAccount:
    def __init__(self, account_number, account_name, balance):
        # Initialize account attributes
        self.account_number = account_number
        self.account_name = account_name
        self.balance = balance

    # Methods for deposit, withdrawal, balance check, and account details display
    def deposit(self, amount):
        self.balance += amount
        print(f"Deposit of {amount} successful. New balance: {self.balance}")

    def withdraw(self, amount):
        if amount > self.balance:
            print("Insufficient balance")
        else:
            self.balance -= amount
            print(f"Withdrawal of {amount} successful. New balance: {self.balance}")

    def check_balance(self):
        print(f"Current balance: {self.balance}")

    def display_details(self):
        print(f"Account Number: {self.account_number}")
        print(f"Account Name: {self.account_name}")
        print(f"Balance: {self.balance}")

# Define a class for Bank
class Bank:
    def __init__(self):
        # Initialize an empty dictionary to store accounts
        self.accounts = {}

    # Method to create a new account
    def create_account(self, account_number, account_name, initial_balance):
        if account_number in self.accounts:
            print("Account already exists")
        else:
            new_account = BankAccount(account_number, account_name, initial_balance)
            self.accounts[account_number] = new_account
            print("Account created successfully")

    # Method to delete an account
    def delete_account(self, account_number):
        if account_number in self.accounts:
            del self.accounts[account_number]
            print("Account deleted successfully")
        else:
            print("Account not found")

    # Method to display all accounts
    def display_accounts(self):
        for account in self.accounts.values():
            account.display_details()
            print("------------------------")

# Define a main function
def main():
    # Create a new bank instance
    bank = Bank()

    # Main loop for user interaction
    while True:
        # Display menu options
        print("1. Create Account")
        print("2. Delete Account")
        print("3. Display Accounts")
        print("4. Deposit")
        print("5. Withdraw")
        print("6. Check Balance")
        print("7. Exit")

        # Get user input
        choice = input("Enter your choice: ")

        # Handle user input
        if choice == "1":
            # Create a new account
            account_number = input("Enter account number: ")
            account_name = input("Enter account name: ")
            initial_balance = float(input("Enter initial balance: "))
            bank.create_account(account_number, account_name, initial_balance)
        elif choice == "2":
            # Delete an account
            account_number = input("Enter account number: ")
            bank.delete_account(account_number)
        elif choice == "3":
            # Display all accounts
            bank.display_accounts()
        elif choice == "4":
            # Deposit money into an account
            account_number = input("Enter account number: ")
            if account_number in bank.accounts:
                amount = float(input("Enter amount to deposit: "))
                bank.accounts[account_number].deposit(amount)
            else:
                print("Account not found")
        elif choice == "5":
            # Withdraw money from an account
            account_number = input("Enter account number: ")
            if account_number in bank.accounts:
                amount = float(input("Enter amount to withdraw: "))
                bank.accounts[account_number].withdraw(amount)
            else:
                print("Account not found")
        elif choice == "6":
            # Check account balance
            account_number = input("Enter account number: ")
            if account_number in bank.accounts:
                bank.accounts[account_number].check_balance()
            else:
                print("Account not found")
        elif choice == "7":
            # Exit the program
            break
        else:
            print("Invalid choice")

# Call the main function
if __name__ == "__main__":
    main()