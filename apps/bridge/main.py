import flet as ft
import requests
import os
import time
import threading
import random
from dotenv import load_dotenv

# --- MODO DE PRUEBA ---
MODE_DEMO = True  # Cambia a False para usar la API real

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
CLOUD_API_URL = os.getenv("CLOUD_API_URL", "http://localhost:3000/api/access-control")
CLOUD_API_KEY = os.getenv("CLOUD_API_KEY", "secret_key")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "local_org")


class AccessBridgeApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.running = False
        self.setup_ui()
        if MODE_DEMO:
            self.load_demo_data()

    def setup_ui(self):
        self.page.title = "Fit-Stack Access Bridge - " + ("DEMO" if MODE_DEMO else "LIVE")
        self.page.theme_mode = ft.ThemeMode.DARK
        self.page.bgcolor = "#111827"
        self.page.window.width = 1100
        self.page.window.height = 800
        self.page.padding = 0

        # --- Components ---
        self.status_icon = ft.Icon(ft.Icons.CIRCLE, color=ft.Colors.RED_400, size=15)
        self.status_text = ft.Text(
            "SISTEMA DESCONECTADO",
            color=ft.Colors.RED_400,
            weight=ft.FontWeight.BOLD,
        )

        self.log_list = ft.ListView(
            expand=True,
            spacing=10,
            padding=20,
            auto_scroll=True,
        )

        self.sync_status_text = ft.Text(
            "Última sincronización: --:--",
            size=12,
            color=ft.Colors.GREY_500,
        )

        # --- Start/Stop Button (ref needed to update it later) ---
        self.service_btn = ft.FilledButton(
            "INICIAR SERVICIO",
            icon=ft.Icons.PLAY_ARROW_ROUNDED,
            on_click=self.toggle_service,
            style=ft.ButtonStyle(
                bgcolor=ft.Colors.CYAN_700,
                color=ft.Colors.WHITE,
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )

        # --- Sidebar ---
        sidebar = ft.Container(
            content=ft.Column([
                ft.Container(
                    content=ft.Row([
                        ft.Icon(ft.Icons.SHIELD_ROUNDED, size=32, color=ft.Colors.CYAN_400),
                        ft.Text(
                            "FIT-STACK",
                            weight=ft.FontWeight.BOLD,
                            size=24,
                            color=ft.Colors.WHITE,
                        ),
                    ], spacing=10),
                    padding=30,
                ),
                ft.Divider(height=1, color="#1F2937"),
                ft.Column([
                    self.nav_item(ft.Icons.DASHBOARD_ROUNDED, "Dashboard", True),
                    self.nav_item(ft.Icons.PEOPLE_ALT_ROUNDED, "Miembros", False),
                    self.nav_item(ft.Icons.HISTORY_ROUNDED, "Historial", False),
                    self.nav_item(ft.Icons.SETTINGS_ROUNDED, "Ajustes", False),
                ], spacing=5, scroll=ft.ScrollMode.ADAPTIVE),
                ft.Container(expand=True),
                ft.Container(
                    content=self.service_btn,
                    padding=20,
                    alignment=ft.Alignment(0, 0),
                ),
            ]),
            width=260,
            bgcolor="#111827",
            border=ft.Border.only(right=ft.BorderSide(1, "#1F2937")),
        )

        # --- Main Content ---
        self.members_count = ft.Text("0", size=32, weight=ft.FontWeight.BOLD)
        self.access_count = ft.Text("0", size=32, weight=ft.FontWeight.BOLD)

        main_content = ft.Container(
            content=ft.Column([
                # Header
                ft.Row([
                    ft.Column([
                        ft.Text(
                            "Panel de Control de Acceso",
                            size=28,
                            weight=ft.FontWeight.BOLD,
                            color=ft.Colors.WHITE,
                        ),
                        ft.Text(
                            "Monitoreo de biometría en tiempo real",
                            color=ft.Colors.GREY_500,
                        ),
                    ]),
                    ft.Container(
                        content=ft.Row([
                            self.status_icon,
                            self.status_text,
                        ], spacing=10),
                        padding=ft.Padding(15, 15, 15, 15),
                        border_radius=12,
                        bgcolor="#1F2937",
                    ),
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),

                # Stats Row
                ft.Row([
                    self.stat_card(
                        "Miembros Activos",
                        self.members_count,
                        ft.Icons.PERSON_OUTLINE_ROUNDED,
                        ft.Colors.CYAN_400,
                    ),
                    self.stat_card(
                        "Entradas Hoy",
                        self.access_count,
                        ft.Icons.LOGIN_ROUNDED,
                        ft.Colors.GREEN_400,
                    ),
                    self.stat_card(
                        "Alertas / Fallos",
                        ft.Text("0", size=32, weight=ft.FontWeight.BOLD),
                        ft.Icons.WARNING_AMBER_ROUNDED,
                        ft.Colors.AMBER_400,
                    ),
                ], spacing=20),

                # Logs Section
                ft.Text(
                    "Actividad Reciente",
                    weight=ft.FontWeight.BOLD,
                    size=20,
                    color=ft.Colors.WHITE,
                ),
                ft.Container(
                    content=self.log_list,
                    bgcolor="#1F2937",
                    border_radius=16,
                    expand=True,
                    padding=10,
                    border=ft.Border.all(1, "#374151"),
                ),
                ft.Row([
                    self.sync_status_text,
                    ft.Text(
                        "v1.0.0 - Demo Mode" if MODE_DEMO else "v1.0.0 Live",
                        size=12,
                        color=ft.Colors.GREY_700,
                    ),
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            ], expand=True, spacing=20),
            padding=40,
            expand=True,
            bgcolor="#0F172A",
        )

        self.page.add(
            ft.Row([sidebar, main_content], expand=True, spacing=0)
        )

    def nav_item(self, icon: str, label: str, selected: bool):
        return ft.Container(
            content=ft.Row([
                ft.Icon(
                    icon,
                    color=ft.Colors.CYAN_400 if selected else ft.Colors.GREY_500,
                    size=20,
                ),
                ft.Text(
                    label,
                    color=ft.Colors.WHITE if selected else ft.Colors.GREY_500,
                    weight=ft.FontWeight.W_500,
                ),
            ], spacing=15),
            padding=ft.Padding(20, 12, 20, 12),
            bgcolor="#1F2937" if selected else None,
            border_radius=8,
        )

    def stat_card(self, title: str, value_obj: ft.Text, icon: str, color):
        return ft.Container(
            content=ft.Column([
                ft.Row([
                    ft.Icon(icon, color=color, size=24),
                    ft.Text(title, color=ft.Colors.GREY_400, size=14),
                ]),
                value_obj,
            ], spacing=10),
            bgcolor="#1F2937",
            padding=24,
            border_radius=16,
            expand=True,
            border=ft.Border.all(1, "#374151"),
        )

    def load_demo_data(self):
        self.members_count.value = "1,245"
        self.access_count.value = "86"

        nombres = [
            "Matias Arze", "Carlos García", "Ana Smith",
            "Luis Rodríguez", "Lucía Fernández", "Jorge Pérez", "Mónica Ruiz",
        ]
        mensajes = [
            "Acceso Rostro - Entrada Principal",
            "Acceso QR - Torniquete 1",
            "Membresía Vencida",
            "Acceso Manual",
            "Error de lectura - Intento 2",
        ]

        for _ in range(15):
            name = random.choice(nombres)
            status = "granted" if random.random() > 0.2 else "denied"
            msg = random.choice(mensajes) if status == "granted" else "Suscripción Inactiva / Vencida"
            self.add_log(name, status, msg)

    def add_log(self, name: str, status: str, message: str):
        is_granted = status == "granted"
        color = ft.Colors.GREEN_400 if is_granted else ft.Colors.RED_400
        icon = ft.Icons.VERIFIED_USER_ROUNDED if is_granted else ft.Icons.GPP_BAD_ROUNDED
        icon_bg = ft.Colors.with_opacity(0.1, color)

        log_entry = ft.Container(
            content=ft.Row([
                ft.Container(
                    content=ft.Icon(icon, color=color, size=20),
                    padding=10,
                    bgcolor=icon_bg,
                    border_radius=10,
                ),
                ft.Column([
                    ft.Text(name, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE),
                    ft.Text(message, size=13, color=ft.Colors.GREY_400),
                ], spacing=2, expand=True),
                ft.Text(time.strftime("%H:%M:%S"), color=ft.Colors.GREY_500, size=12),
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            padding=ft.Padding(15, 10, 15, 10),
            border=ft.Border.only(bottom=ft.BorderSide(1, "#374151")),
        )

        self.log_list.controls.insert(0, log_entry)
        if len(self.log_list.controls) > 20:
            self.log_list.controls.pop()
        self.page.update()

    def toggle_service(self, e):
        self.running = not self.running

        if self.running:
            self.service_btn.text = "DETENER"
            self.service_btn.icon = ft.Icons.STOP_ROUNDED
            self.service_btn.style.bgcolor = ft.Colors.RED_700
            self.status_icon.color = ft.Colors.GREEN_400
            self.status_text.value = "SISTEMA ONLINE"
            self.status_text.color = ft.Colors.GREEN_400
            threading.Thread(target=self.bg_polling, daemon=True).start()
            self.add_log("Sistema", "granted", "Servicio sincronizado con la nube")
        else:
            self.service_btn.text = "INICIAR SERVICIO"
            self.service_btn.icon = ft.Icons.PLAY_ARROW_ROUNDED
            self.service_btn.style.bgcolor = ft.Colors.CYAN_700
            self.status_icon.color = ft.Colors.RED_400
            self.status_text.value = "SISTEMA DESCONECTADO"
            self.status_text.color = ft.Colors.RED_400
            self.add_log("Sistema", "denied", "Conexión cerrada por el usuario")

        self.page.update()

    def bg_polling(self):
        nombres_demo = ["Simulación Usuario", "Test Biométrico", "Acceso Demo"]
        while self.running:
            if MODE_DEMO:
                time.sleep(5)
                if self.running and random.random() > 0.7:
                    self.add_log(random.choice(nombres_demo), "granted", "Detección de rostro - OK")
                continue

            try:
                headers = {"x-api-key": CLOUD_API_KEY}
                params = {"organizationId": ORGANIZATION_ID}
                resp = requests.get(
                    f"{CLOUD_API_URL}/sync-tasks",
                    headers=headers,
                    params=params,
                    timeout=5,
                )
                if resp.status_code == 200:
                    tasks = resp.json()
                    for task in tasks:
                        self.process_sync_task(task)
                self.sync_status_text.value = f"Última sincronización: {time.strftime('%H:%M:%S')}"
                self.page.update()
            except requests.RequestException as e:
                print(f"Error de red en polling: {e}")
            except Exception as e:
                print(f"Error inesperado en polling: {e}")

            time.sleep(10)

    def process_sync_task(self, task: dict):
        self.add_log(
            "Sincronización Cloud",
            "granted",
            f"Actualizando perfil: {task['firstName']}",
        )
        try:
            time.sleep(1)
            headers = {"x-api-key": CLOUD_API_KEY}
            requests.post(
                f"{CLOUD_API_URL}/mark-synced",
                headers=headers,
                json={"taskId": task["taskId"], "status": "completed"},
            )
        except requests.RequestException as e:
            print(f"Error al marcar sincronización: {e}")
        except Exception as e:
            print(f"Error inesperado al procesar tarea: {e}")


def main(page: ft.Page):
    AccessBridgeApp(page)


if __name__ == "__main__":
    ft.run(main)
