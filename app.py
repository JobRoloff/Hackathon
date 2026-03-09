"""
Temporary Flask API for robot maintenance prediction.
Run: flask --app app run -p 5000
"""

from flask import Flask, request, jsonify

from predict_model import predict_outcome

app = Flask(__name__)


@app.route("/predict", methods=["POST"])
def predict():
    """Accept a robot snapshot JSON and return prediction from underlying model."""
    try:
        data = request.get_json(force=True, silent=True)
        if data is None:
            return jsonify({"error": "Invalid or missing JSON body"}), 400
        result = predict_outcome(data)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
