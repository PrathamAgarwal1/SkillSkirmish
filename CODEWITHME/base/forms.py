from django import forms
from .models import Room

class RoomForm(forms.ModelForm):
    class Meta:
        model = Room
        fields = ['name', 'description']
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'Enter room name...'}),
            'description': forms.Textarea(attrs={'placeholder': 'Describe your room...'})
        }