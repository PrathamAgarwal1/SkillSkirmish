from django.urls import path
from . import views

urlpatterns = [
    path('', views.front, name='front'),
    path('signup', views.signupPage, name='signup'),
    path('login', views.loginPage, name='login'),
    path('logout', views.logoutUser, name='logout'),
    path('challenges', views.challenges, name='challenges'),
    path('team', views.team_rooms, name='team'),  # Changed from teams to team_rooms
    path('team/create', views.createRoom, name='create-room'),
    path('team/<int:pk>', views.room_view, name='room'),
    path('team/update/<int:pk>', views.updateRoom, name='update-room'),
    path('team/delete/<int:pk>', views.deleteRoom, name='delete-room'),
]