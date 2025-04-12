from django.urls import path,re_path
from . import views
from .views import FrontendAppView
from django.views.generic import RedirectView
urlpatterns = [
    path('', views.front, name='front'),
    path('signup', views.signupPage, name='signup'),
    path('login', views.loginPage, name='login'),
    path('logout', views.logoutUser, name='logout'),
    path('team', views.team_rooms, name='team'),  # Changed from teams to team_rooms
    path('team/create', views.createRoom, name='create-room'),
    path('team/<int:pk>', views.room_view, name='room'),
    path('team/update/<int:pk>', views.updateRoom, name='update-room'),
    path('team/delete/<int:pk>', views.deleteRoom, name='delete-room'),
    re_path(r"^.*$", FrontendAppView.as_view()),
    path('challenges/', FrontendAppView.as_view(), name='challenges-react'),

    # optional: redirect unknown URLs to Django front
    path('', RedirectView.as_view(pattern_name='front')),
]