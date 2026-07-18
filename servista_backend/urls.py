from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('', lambda request: JsonResponse({'message': 'Servista API is running'})),
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/services/', include('services.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/wallet/', include('wallet.urls')),
    path('api/messages/', include('messaging.urls')),
    path('api/dss/', include('admin_dss.dss_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
