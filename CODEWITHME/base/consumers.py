import json
from channels.generic.websocket import AsyncWebsocketConsumer

class CodeRoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'code_room_{self.room_name}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        if message_type == 'chat_message':
            # Broadcast chat message to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message': data['message'],
                    'username': data['username']
                }
            )
        elif message_type == 'code_update':
            # Broadcast code update to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'code_update',
                    'code': data['code'],
                    'sender_channel_name': self.channel_name
                }
            )
        elif message_type == 'webrtc_signal':
            # Forward WebRTC signaling messages to specific user
            await self.channel_layer.send(
                data['target'],
                {
                    'type': 'webrtc_signal',
                    'signal': data['signal'],
                    'sender': self.channel_name
                }
            )

    async def chat_message(self, event):
        # Send chat message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'username': event['username']
        }))

    async def code_update(self, event):
        # Don't send back to sender
        if self.channel_name != event['sender_channel_name']:
            await self.send(text_data=json.dumps({
                'type': 'code_update',
                'code': event['code']
            }))

    async def webrtc_signal(self, event):
        # Forward WebRTC signaling message
        await self.send(text_data=json.dumps({
            'type': 'webrtc_signal',
            'signal': event['signal'],
            'sender': event['sender']
        }))

class VideoCallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'call_{self.room_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'peer_disconnected',
                'peer_id': self.channel_name
            }
        )
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        data['peer_id'] = self.channel_name

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'relay_message',
                'message': data
            }
        )

    async def relay_message(self, event):
        message = event['message']
        await self.send(text_data=json.dumps(message))

    async def peer_disconnected(self, event):
        await self.send(text_data=json.dumps({
            'type': 'peer-disconnected',
            'peerId': event['peer_id']
        }))