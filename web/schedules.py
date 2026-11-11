"""
Scheduler: every scheduled job of every dashboard and automation, with its time,
on/off switch, last and next run. Saving here changes when web/scheduler.py runs it.
"""
from flask import Blueprint, jsonify, redirect, render_template, request

from web import scheduler

schedules_bp = Blueprint('schedules', __name__)


@schedules_bp.route('/automations')
def old_address():
    # Earlier address of this page
    return redirect('/scheduler', code=301)


@schedules_bp.route('/scheduler')
def schedules_page():
    return render_template('schedules.html', active_nav='schedules')


@schedules_bp.route('/api/schedules', methods=['GET'])
def schedules_status():
    return jsonify(scheduler.status())


@schedules_bp.route('/api/schedules/<job_id>', methods=['POST'])
def schedules_save(job_id):
    # Only the page's own JS sends this header; a cross-site form can't (see ndo routes)
    if request.headers.get('X-Naar-Request') != '1':
        return jsonify({'error': 'Missing X-Naar-Request header'}), 403
    body = request.get_json(silent=True) or {}
    time = body.get('time')
    enabled = body.get('enabled')
    if enabled is not None and not isinstance(enabled, bool):
        return jsonify({'error': 'enabled must be true or false'}), 400
    try:
        saved = scheduler.save_settings(job_id, time=time, enabled=enabled)
    except KeyError:
        return jsonify({'error': f'No scheduled job {job_id}'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'saved': saved, **scheduler.status()})
