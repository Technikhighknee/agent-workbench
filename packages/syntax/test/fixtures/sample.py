"""Sample Python file for testing."""

from typing import List, Optional

VERSION = "1.0.0"


class Calculator:
    """A simple calculator class."""

    def __init__(self, value: int = 0):
        """Initialize the calculator."""
        self.value = value

    def add(self, x: int) -> int:
        """Add x to the current value."""
        self.value += x
        return self.value

    def subtract(self, x: int) -> int:
        """Subtract x from the current value."""
        self.value -= x
        return self.value

    @staticmethod
    def multiply(a: int, b: int) -> int:
        """Multiply two numbers."""
        return a * b


def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"


async def fetch_data(url: str) -> str:
    """Fetch data from a URL."""
    return "data"
