from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token
from django.urls import reverse  # Add this import
from .models import Profile,Room
from .forms import RoomForm
from django.shortcuts import get_object_or_404
from django.views.generic import View
import os

@ensure_csrf_cookie
def front(request):
    # Ensure CSRF cookie is set
    get_token(request)
    context = {}
    if 'open_login' in request.GET:
        context['open_login'] = True
    if 'open_signup' in request.GET:
        context['open_signup'] = True
    return render(request, 'base/front.html', context)
def signupPage(request):
    if request.method == 'POST':
        full_name = request.POST.get('fullname', '').strip()  # Added default value and strip
        username = request.POST.get('username', '').lower().strip()
        email = request.POST.get('email', '').strip()
        password1 = request.POST.get('password1', '')
        password2 = request.POST.get('password2', '')
        
        # Validation checks
        if not all([full_name, username, email, password1, password2]):
            messages.error(request, 'All fields are required.')
            return redirect(f"{reverse('front')}?open_signup=true")
            
        if password1 != password2:
            messages.error(request, 'Passwords do not match.')
            return redirect(f"{reverse('front')}?open_signup=true")
            
        if User.objects.filter(username=username).exists():
            messages.error(request, 'Username already exists.')
            return redirect(f"{reverse('front')}?open_signup=true")
            
        if User.objects.filter(email=email).exists():
            messages.error(request, 'Email already exists.')
            return redirect(f"{reverse('front')}?open_signup=true")
        
        try:    
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password1
            )
            user.first_name = full_name
            user.save()
            
            Profile.objects.create(user=user)
            login(request, user)
            
            messages.success(request, 'Account created successfully!')
            return redirect('front')
        except Exception as e:
            messages.error(request, f'Error creating account: {str(e)}')
            return redirect(f"{reverse('front')}?open_signup=true")
    
    # If GET request
    return redirect(f"{reverse('front')}?open_signup=true")
def loginPage(request):
    if request.user.is_authenticated:
        messages.info(request, 'Already logged in')
        return redirect('front')
        
    if request.method == 'POST':
        username = request.POST.get('username', '').lower()
        password = request.POST.get('password', '')
        
        try:
            User.objects.get(username=username)
            user = authenticate(request, username=username, password=password)
            
            if user is not None:
                login(request, user)
                messages.success(request, 'Successfully logged in')
                return redirect('front')
            else:
                messages.error(request, 'Incorrect password')
                return render(request, 'base/front.html', {'open_login': True})
                
        except User.DoesNotExist:
            messages.error(request, 'Username does not exist')
            return render(request, 'base/front.html', {'open_login': True})
            
    # If GET request
    return render(request, 'base/front.html', {'open_login': True})
def logoutUser(request):
    if request.user.is_authenticated:
        logout(request)
        messages.info(request, "Successfully logged out.")
    return redirect('front')

def home(request):
    # Add your home view logic here
    return render(request, 'base/home.html')

def teams(request):
    return render(request, 'base/team.html')


@login_required
def createRoom(request):
    if request.method == 'POST':
        form = RoomForm(request.POST)
        if form.is_valid():
            room = form.save(commit=False)
            room.host = request.user
            room.save()
            room.participants.add(request.user)  # Add creator as participant
            messages.success(request, 'Room created successfully!')
            return redirect('room', pk=room.id)
        else:
            messages.error(request, 'Error creating room. Please check your inputs.')
    else:
        form = RoomForm()
    
    context = {'form': form}
    return render(request, 'base/room_form.html', context)
def room_view(request, pk):
    room = get_object_or_404(Room, id=pk)
    context = {
        'room': room,
        'participants': room.participants.all(),
        'is_host': room.host == request.user
    }
    return render(request, 'base/room.html', context)
def room_list(request):
    rooms = Room.objects.all().order_by('-updated_at')
    context = {'rooms': rooms}
    return render(request, 'base/room_list.html', context)
@login_required
def updateRoom(request, pk):
    room = get_object_or_404(Room, id=pk)
    
    # Verify the current user is the room host
    if request.user != room.host:
        messages.error(request, 'You are not authorized to edit this room!')
        return redirect('room', pk=room.id)
    
    if request.method == 'POST':
        form = RoomForm(request.POST, instance=room)
        if form.is_valid():
            form.save()
            messages.success(request, 'Room updated successfully!')
            return redirect('room', pk=room.id)
    else:
        form = RoomForm(instance=room)
    
    context = {'form': form, 'room': room}
    return render(request, 'base/room_form.html', context)
@login_required
def deleteRoom(request, pk):
    room = get_object_or_404(Room, id=pk)
    
    # Verify the current user is the room host
    if request.user != room.host:
        messages.error(request, 'You are not authorized to delete this room!')
        return redirect('room', pk=room.id)
    
    if request.method == 'POST':
        room.delete()
        messages.success(request, 'Room deleted successfully!')
        return redirect('team')
    
    return render(request, 'base/delete_room.html', {'room': room})
@login_required
def team_rooms(request):
    try:
        rooms = Room.objects.all().order_by('-updated_at')
        context = {
            'rooms': rooms,
            'user_rooms': request.user.created_rooms.all(),
            'participating_rooms': request.user.participants.all()
        }
        return render(request, 'base/team.html', context)
    except ValueError as e:
        messages.error(request, "Error loading rooms. Please contact administrator.")
        return redirect('home')

class FrontendAppView(View):
    def get(self, request):
        try:
            with open(os.path.join('client', 'build', 'index.html')) as file:
                return HttpResponse(file.read())
        except:
            return HttpResponse(
                "index.html not found. Run `npm run build` inside client directory.",
                status=501,
            )
