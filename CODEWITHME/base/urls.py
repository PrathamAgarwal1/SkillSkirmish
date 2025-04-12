from django.urls import path, re_path
from . import views
from .views import FrontendAppView
from django.views.generic import RedirectView

urlpatterns = [
    # Core app URLs
    path('', views.front, name='front'),
    path('signup', views.signupPage, name='signup'),
    path('login', views.loginPage, name='login'),
    path('logout', views.logoutUser, name='logout'),
    
    # Team/Room URLs
    path('team', views.team_rooms, name='team'),
    path('team/create', views.createRoom, name='create-room'),
    path('team/<int:pk>', views.room_view, name='room'),
    path('team/update/<int:pk>', views.updateRoom, name='update-room'),
    path('team/delete/<int:pk>', views.deleteRoom, name='delete-room'),
    path('game/', views.game_portal, name='game-portal'),
    path('challenges/', views.game_portal, name='challenges'),
]