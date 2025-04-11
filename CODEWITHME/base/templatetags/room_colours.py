from django import template

register = template.Library()

COLOR_PALETTE = [
    '#FF9AA2', '#FFB7B2', '#FFDAC1',
    '#E2F0CB', '#B5EAD7', '#C7CEEA'
]

@register.simple_tag
def get_room_color(index):
    """Returns a color from our palette"""
    return COLOR_PALETTE[index % len(COLOR_PALETTE)]