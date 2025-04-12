from django.db import models
from django.contrib.auth.models import User

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    full_name = models.CharField(max_length=100)
    profile_pic = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    interests = models.CharField(max_length=255, choices=[
        ('web-dev', 'Web Development'),
        ('ai', 'Artificial Intelligence'),
        ('cybersecurity', 'Cybersecurity')
    ], blank=True)
    skills = models.TextField(blank=True)
    progress = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.user.username

class Topic(models.Model):
    name = models.CharField(max_length=200)

    def __str__(self):
        return self.name
    
class Room(models.Model):
    host = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='created_rooms'  # Add this line
    )
    name = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    participants = models.ManyToManyField(User, related_name='participants', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return self.name

class CodeSnippet(models.Model):
    """
    Stores code snippets associated with a room
    - room: The room this snippet belongs to
    - content: The actual code content
    - language: Programming language of the code
    - timestamps: When created and last updated
    """
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='code_snippets')
    content = models.TextField()
    language = models.CharField(max_length=30, default='javascript')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)