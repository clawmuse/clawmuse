package expo.modules.twowayaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/** Started while the composer is visible, before conversation capture begins. */
class VoiceCaptureService : Service() {
    companion object {
        private const val CHANNEL_ID = "voice-conversation"
        private const val NOTIFICATION_ID = 7067
        private const val STOP_ACTION = "expo.modules.twowayaudio.STOP_VOICE"
        private var onStopped: (() -> Unit)? = null
        private var requestedGeneration = 0L

        fun start(context: Context, onStop: () -> Unit) {
            requestedGeneration += 1
            onStopped = onStop
            try {
                val intent = Intent(context, VoiceCaptureService::class.java)
                    .putExtra("generation", requestedGeneration)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
            } catch (error: Exception) {
                onStopped = null
                throw error
            }
        }

        fun stop(context: Context) {
            onStopped = null
            context.stopService(Intent(context, VoiceCaptureService::class.java))
        }
    }

    private var activeGeneration = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val generation = intent?.getLongExtra("generation", 0L) ?: 0L
        if (generation != requestedGeneration) return START_NOT_STICKY
        activeGeneration = generation
        if (intent?.action == STOP_ACTION || onStopped == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(
                CHANNEL_ID, getString(R.string.voice_capture_channel), NotificationManager.IMPORTANCE_LOW
            ))
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
            else Notification.Builder(this)
        val stop = PendingIntent.getService(this, 0,
            Intent(this, VoiceCaptureService::class.java).setAction(STOP_ACTION)
                .putExtra("generation", activeGeneration),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.voice_capture_title))
            .setContentText(getString(R.string.voice_capture_body))
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(Notification.Action.Builder(null, getString(R.string.voice_capture_stop), stop).build())
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            builder.setContentIntent(PendingIntent.getActivity(this, 1, launch,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, builder.build())
            }
        } catch (error: RuntimeException) {
            Log.e("VoiceCaptureService", "Microphone foreground service was rejected", error)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (activeGeneration == requestedGeneration) {
            val stopped = onStopped
            onStopped = null
            stopped?.invoke()
        }
        super.onDestroy()
    }
}
